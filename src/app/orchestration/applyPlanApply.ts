import {
  buildApplyPlanFailureReport,
  type PreviewFailureInfo,
} from "@/core/diagnostics/failureReport";
import { summarizePostApplyRequirements } from "@/core/agent/postApplyRequirementCheck";
import {
  createFollowUpCheckpoint,
  rollbackPartialApply,
  buildUndoBatchFromApprovedFiles,
} from "@/core/build/followUpCheckpoint";
import { commandResultLine } from "@/core/greenfield/runLog";
import { finalizeOrchestrationAfterApplyPlan } from "@/app/orchestration/applyPlanFinalize";
import {
  runFollowUpQuickRepairBeforeAutoFix,
} from "@/app/orchestration/followUpVerifyRepairOrchestration";
import { schedulePostApplyUiAudit } from "@/app/orchestration/postApplyUiAudit";
import {
  logPatchApplied,
  logPatchApplyFailed,
  logPatchApplyStart,
  logPatchApplySuccess,
  logVerifyBuild,
  logVerifyBuildStart,
  logVerifyTypescript,
  logVerifyTypescriptStart,
} from "@/core/agent/editPipelineLogs";
import {
  clearPatchGeneratedWatchdog,
  notifyPatchApplyStageReached,
  startPatchApplyWatchdog,
} from "@/core/agent/patchApplyWatchdog";
import {
  completeRunTimeline,
  failRunTimeline,
  getActiveRunTimeline,
  recordRunTimelineStage,
} from "@/core/agent/runTimeline";
import { getIntelligenceHost } from "@/app/intelligence/intelligenceHost";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import { formatApplyPlanSuccessLatestAction } from "@/core/orchestration/applyPlanSuccess";
import {
  computePlanApplyTotals,
  evaluateIncompleteCoordinatedApply,
  resolvePlanApplySessionForApply,
  settleIncompleteCoordinatedApply,
  validateProposalQuality,
  validateCreateProposalQuality,
  type PlanApplySession,
} from "@/core/planApply";
import { freezePlanApplyFileDiffs } from "@/core/agent/runFileDiffs";
import { previewDiagnosticsToFailureInfo } from "@/core/preview/diagnostics";
import {
  recordModifiedFiles,
  recordVerificationFailure,
} from "@/core/sessionMemory";
import { verificationSummaryLines } from "@/core/studioRun/types";
import type { BryantLabsApi, ProjectInfo, VerificationResult } from "@/types";

export interface ApplyApprovedPlanOptions {
  readonly pipelineMode?: boolean;
  readonly session?: PlanApplySession;
  readonly approveReadyFiles?: boolean;
  readonly approveRelPaths?: readonly string[];
}

export interface ApplyApprovedPlanResult {
  readonly ok: boolean;
  readonly verification: VerificationResult | null;
  readonly applied: readonly string[];
  readonly error?: string;
}

type ResolvedApplyHost = ApplyPlanOrchestrationHost & {
  api: BryantLabsApi;
  project: ProjectInfo;
  planApplySession: NonNullable<ApplyPlanOrchestrationHost["planApplySession"]>;
};

export async function applyApprovedPlanFilesOrchestration(
  host: ApplyPlanOrchestrationHost | null,
  opts?: ApplyApprovedPlanOptions,
): Promise<ApplyApprovedPlanResult> {
  const sourceSession = opts?.session ?? host?.planApplySession ?? null;
  if (!host?.api || !sourceSession || !host.project) {
    return { ok: false, verification: null, applied: [], error: "No apply session" };
  }

  const resolved = host as ResolvedApplyHost;
  const pipelineMode = opts?.pipelineMode ?? false;
  const api = resolved.api;
  const planApplySession = resolvePlanApplySessionForApply(sourceSession, opts);
  resolved.setPlanApplySession(planApplySession);
  const project = resolved.project;

  const runId = planApplySession.applyRunId ?? resolved.beginApplyPlanRun();
  resolved.applyPlanActiveRunIdRef.current = runId;
  const staleResult = (detail?: string) => {
    if (!resolved.isStaleApplyPlanRun(runId)) return false;
    resolved.ignoreStaleApplyPlanResult(runId, detail);
    return true;
  };

  const approved = planApplySession.files.filter(
    (f) =>
      f.decision === "approved" &&
      f.status === "ready" &&
      f.basisContent !== undefined &&
      f.proposal,
  );

  if (approved.length === 0) {
    const reason = "No approved files to apply.";
    logPatchApplyFailed(reason);
    resolved.setPlanApplyError(reason);
    return { ok: false, verification: null, applied: [], error: "No approved files" };
  }

  const incompleteBeforeWrite = evaluateIncompleteCoordinatedApply({
    prompt: planApplySession.prompt,
    targetPaths: planApplySession.files.map((f) => f.relPath),
    files: planApplySession.files,
  });
  if (incompleteBeforeWrite.incomplete) {
    const reason =
      incompleteBeforeWrite.message ?? "Incomplete patch batch — refusing write.";
    logPatchApplyFailed(reason);
    settleIncompleteCoordinatedApply(resolved, incompleteBeforeWrite);
    resolved.publishFailureReport(buildApplyPlanFailureReport({ applyError: reason }));
    return { ok: false, verification: null, applied: [], error: reason };
  }

  resolved.setPlanApplySession((prev) =>
    prev ? { ...prev, phase: "applying", applyError: null } : prev,
  );
  resolved.setPlanApplyError(null);
  notifyPatchApplyStageReached("applying");
  logPatchApplyStart(approved.map((f) => f.relPath));
  recordRunTimelineStage("apply_start", `${approved.length} file(s)`);
  startPatchApplyWatchdog((message) => {
    failRunTimeline(message);
    resolved.setPlanApplyError(message);
    resolved.setBuildError?.(message);
    resolved.releaseBuildRunForReview?.();
    resolved.setPlanApplySession((prev) =>
      prev ? { ...prev, phase: "review", applyError: message } : prev,
    );
  });

  const { prompt, planSource, planSummary } = planApplySession;
  if (!pipelineMode) {
    resolved.beginStudioAction("apply_plan", "apply_plan", "Apply Plan — writing approved files", {
      details: `${approved.length} file(s)`,
      patch: {
        workflow: {
          prompt,
          planSource,
          planSummary,
          filesAccepted: approved.length,
        },
      },
    });
  }

  const applied: string[] = [];
  let applyError: string | null = null;

  if (!pipelineMode && resolved.saveFollowUpCheckpoint && resolved.project) {
    resolved.saveFollowUpCheckpoint(
      createFollowUpCheckpoint({
        projectPath: resolved.project.path,
        prompt,
        files: approved.map((f) => {
          const action = f.action === "create" ? "create" as const : "modify" as const;
          return {
            relPath: f.relPath,
            absPath: f.absPath,
            content: action === "create" ? "" : f.basisContent!,
            action,
          };
        }),
      }),
    );
  }

  for (const file of approved) {
    const quality =
      file.action === "create"
        ? validateCreateProposalQuality(file.proposal!.newContent, file.relPath, resolved.scan)
        : validateProposalQuality(
            file.basisContent!,
            file.proposal!.newContent,
            file.relPath,
            resolved.scan,
          );
    if (!quality.ok) {
      applyError = `${file.relPath}: ${quality.reason}`;
      break;
    }
    try {
      const summary = file.proposal!.summary?.trim();
      const isCreate = file.action === "create";
      resolved.appendGreenfieldRunLog(
        "write",
        "running",
        isCreate ? `Creating ${file.relPath}` : `Updating ${file.relPath}`,
        summary ?? undefined,
      );
      const res = isCreate
        ? await api.createProjectFile(file.absPath, file.proposal!.newContent)
        : await api.applyEdit(
            file.absPath,
            file.basisContent!,
            file.proposal!.newContent,
          );
      if (res.ok) {
        applied.push(file.relPath);
        resolved.appendGreenfieldRunLog(
          "write",
          "success",
          isCreate ? `Created ${file.relPath}` : `Updated ${file.relPath}`,
          summary ?? undefined,
        );
      } else {
        applyError = `${file.relPath}: ${res.reason ?? "Apply failed"}`;
        break;
      }
    } catch {
      applyError = `${file.relPath}: Apply failed`;
      break;
    }
  }

  if (applyError) {
    if (staleResult("write files")) {
      clearPatchGeneratedWatchdog();
      return { ok: false, verification: null, applied: [], error: "Stale apply run" };
    }

    let rollbackNote: string | null = null;
    if (applied.length > 0) {
      const rollback = await rollbackPartialApply(
        api,
        applied,
        approved
          .filter((f): f is typeof f & { action: "create" | "modify" } =>
            f.action === "create" || f.action === "modify",
          )
          .map((f) => ({
            relPath: f.relPath,
            absPath: f.absPath,
            action: f.action,
            basisContent: f.action === "create" ? "" : f.basisContent!,
          })),
      );
      if (rollback.ok) {
        rollbackNote = `Rolled back ${rollback.rolledBack.length} partially applied file(s).`;
        resolved.appendGreenfieldRunLog(
          "apply_plan",
          "success",
          rollbackNote,
          rollback.rolledBack.join(", "),
        );
      } else {
        rollbackNote = `Partial apply failed and rollback could not complete: ${rollback.error ?? "unknown error"}`;
        resolved.appendGreenfieldRunLog("apply_plan", "failed", rollbackNote);
      }
      await api.replaceUndoBatch([]);
      resolved.setCanUndo(false);
    }

    clearPatchGeneratedWatchdog();
    const combinedError = rollbackNote
      ? `${applyError} ${rollbackNote}`
      : applyError;
    resolved.setPlanApplySession((prev) =>
      prev
        ? {
            ...prev,
            phase: "review",
            applyError: combinedError,
            totals: computePlanApplyTotals(prev.files, []),
          }
        : prev,
    );
    resolved.setPlanApplyError(combinedError);
    const writeReport = buildApplyPlanFailureReport({ applyError: combinedError });
    resolved.setSessionMemory((m) =>
      recordVerificationFailure(m, writeReport.rootCauseLine),
    );
    resolved.publishFailureReport(writeReport);
    logPatchApplyFailed(writeReport.rootCauseLine);
    recordRunTimelineStage("apply_complete", "failed");
    failRunTimeline(writeReport.rootCauseLine);
    if (!pipelineMode) {
      resolved.finishStudioAction("apply_plan", "apply_plan", false, "Apply Plan — write failed", {
        details: writeReport.rootCauseLine,
        patch: {
          filesWritten: applied,
          failureReport: writeReport,
          workflow: {
            prompt,
            planSource,
            planSummary,
            filesAccepted: approved.length,
            filesWritten: applied,
            errors: [writeReport.rootCauseLine],
          },
        },
      });
    }
    return {
      ok: false,
      verification: null,
      applied: [],
      error: writeReport.rootCauseLine,
    };
  }

  const undoBatch = buildUndoBatchFromApprovedFiles(approved, applied);
  const replaced = await api.replaceUndoBatch(undoBatch);
  if (!replaced.ok) {
    resolved.appendGreenfieldRunLog(
      "apply_plan",
      "failed",
      `Wrote files but could not record undo batch: ${replaced.reason ?? "unknown error"}`,
    );
  }

  resolved.appendGreenfieldRunLog(
    "apply_plan",
    "success",
    `Wrote ${applied.length} file(s)`,
    applied.join(", "),
  );
  logPatchApplied(true, applied);
  logPatchApplySuccess(applied);
  recordRunTimelineStage("apply_complete", `${applied.length} file(s)`);
  clearPatchGeneratedWatchdog();
  resolved.updateGreenfieldRun({ filesWritten: applied });
  resolved.setSessionMemory((m) => recordModifiedFiles(m, applied));
  void getIntelligenceHost()?.persistSessionMemory();
  void getIntelligenceHost()?.refreshFeatureInventory();
  resolved.recordSmartFileHistory(prompt, applied, true);

  void resolved.runScan();

  resolved.setPlanApplySession((prev) =>
    prev
      ? {
          ...prev,
          phase: "verifying",
          totals: computePlanApplyTotals(prev.files, applied),
        }
      : prev,
  );

  resolved.appendGreenfieldRunLog("verification", "running", "Verification started");
  notifyPatchApplyStageReached("verifying");
  logVerifyTypescriptStart();
  logVerifyBuildStart();
  recordRunTimelineStage("typescript_start");
  recordRunTimelineStage("build_start");

  let verification: VerificationResult | null = null;
  let verifyErr: string | null = null;
  try {
    const res = await api.verify();
    if ("error" in res) {
      verifyErr = res.error;
      recordRunTimelineStage("typescript_complete", "error");
      recordRunTimelineStage("build_complete", "skipped");
      resolved.setPlanApplyError(res.error);
      const errReport = buildApplyPlanFailureReport({ verifyErr: res.error });
      resolved.setSessionMemory((m) =>
        recordVerificationFailure(m, errReport.rootCauseLine),
      );
      resolved.publishFailureReport(errReport);
      resolved.appendGreenfieldRunLog(
        "verification",
        "failed",
        "Verification failed",
        errReport.rootCauseLine,
      );
    } else {
      verification = res;
      resolved.setVerification(res);
      resolved.setVerifyStatus("done");
      const lines = verificationSummaryLines(res);
      if (!lines.ok) {
        const report = buildApplyPlanFailureReport({
          verification: res,
          verifyErr: null,
        });
        recordRunTimelineStage("typescript_complete", lines.typecheck);
        recordRunTimelineStage("build_complete", lines.build);
        resolved.setSessionMemory((m) =>
          recordVerificationFailure(m, report.rootCauseLine),
        );
        resolved.setPlanApplyError(report.rootCauseLine);
        resolved.publishFailureReport(report);
      } else {
        resolved.updateGreenfieldRun({ failureReport: null });
        const tsOk = res.typecheck.ok;
        const buildOk = res.build.ok;
        logVerifyTypescript(tsOk);
        logVerifyBuild(buildOk);
        recordRunTimelineStage(
          "typescript_complete",
          tsOk ? "passed" : "failed",
        );
        recordRunTimelineStage("build_complete", buildOk ? "passed" : "failed");
        resolved.appendGreenfieldRunLog(
          "typescript",
          tsOk ? "success" : "failed",
          tsOk ? "TypeScript passed" : "TypeScript failed",
          commandResultLine(res.typecheck),
        );
        resolved.appendGreenfieldRunLog(
          "build",
          buildOk ? "success" : "failed",
          buildOk ? "Build passed" : "Build failed",
          commandResultLine(res.build),
        );
      }
      resolved.appendGreenfieldRunLog(
        "verification",
        lines.ok ? "success" : "failed",
        lines.ok ? "Verification passed" : "Verification failed",
        lines.ok
          ? `TypeScript: ${lines.typecheck}; Build: ${lines.build}`
          : buildApplyPlanFailureReport({ verification: res }).rootCauseLine,
      );
    }
  } catch (err) {
    verifyErr =
      err instanceof Error ? err.message : "Verification could not run (see run log).";
    recordRunTimelineStage("typescript_complete", "failed");
    recordRunTimelineStage("build_complete", "skipped");
    resolved.setPlanApplyError(verifyErr);
    const errReport = buildApplyPlanFailureReport({ verifyErr });
    resolved.setSessionMemory((m) => recordVerificationFailure(m, errReport.rootCauseLine));
    resolved.publishFailureReport(errReport);
    resolved.appendGreenfieldRunLog("verification", "failed", verifyErr);
  }

  if (staleResult("verification")) {
    return { ok: false, verification, applied, error: "Stale apply run" };
  }

  const totals = computePlanApplyTotals(planApplySession.files, applied);
  let verLines = verificationSummaryLines(verification);

  if (
    !verifyErr &&
    verification &&
    !verLines.ok &&
    applied.length > 0 &&
    !pipelineMode
  ) {
    const quickVerification = await runFollowUpQuickRepairBeforeAutoFix(
      resolved,
      project.path,
      verification,
    );
    if (quickVerification !== verification) {
      verification = quickVerification;
      resolved.setVerification(quickVerification);
      verLines = verificationSummaryLines(quickVerification);
      if (verLines.ok) {
        resolved.updateGreenfieldRun({ failureReport: null });
        logVerifyTypescript(quickVerification.typecheck.ok);
        logVerifyBuild(quickVerification.build.ok);
        recordRunTimelineStage(
          "typescript_complete",
          quickVerification.typecheck.ok ? "passed" : "failed",
        );
        recordRunTimelineStage(
          "build_complete",
          quickVerification.build.ok ? "passed" : "failed",
        );
        resolved.appendGreenfieldRunLog(
          "typescript",
          quickVerification.typecheck.ok ? "success" : "failed",
          quickVerification.typecheck.ok ? "TypeScript passed" : "TypeScript failed",
          commandResultLine(quickVerification.typecheck),
        );
        resolved.appendGreenfieldRunLog(
          "build",
          quickVerification.build.ok ? "success" : "failed",
          quickVerification.build.ok ? "Build passed" : "Build failed",
          commandResultLine(quickVerification.build),
        );
        resolved.appendGreenfieldRunLog(
          "verification",
          "success",
          "Verification passed after quick repair",
          `TypeScript: ${verLines.typecheck}; Build: ${verLines.build}`,
        );
      }
    }
  }

  let previewInfo: PreviewFailureInfo | undefined;
  let previewOk = true;
  let previewUrl: string | null = null;

  if (!verifyErr && verLines.ok && applied.length > 0 && !pipelineMode) {
    resolved.appendGreenfieldRunLog("preview", "running", "Starting preview server");
    recordRunTimelineStage("preview_start");
    try {
      const previewRes = await api.greenfieldPreviewStart(project.path);
      if (previewRes.ok) {
        previewUrl = previewRes.url ?? null;
        if (previewUrl) {
          resolved.setAppPreview({
            url: previewUrl,
            running: true,
            root: project.path,
            lastSuccessfulPreviewAt: Date.now(),
            port: (() => {
              try {
                const p = new URL(previewUrl!).port;
                return p ? Number(p) : 4173;
              } catch {
                return 4173;
              }
            })(),
          });
        }
        recordRunTimelineStage(
          "preview_complete",
          previewRes.url ? `url=${previewRes.url}` : "started",
        );
        resolved.appendGreenfieldRunLog(
          "preview",
          "success",
          "Preview started",
          previewRes.url ?? "",
        );
        resolved.requestPreviewTab();
      } else if (previewRes.diagnostics?.hasPreviewScript) {
        previewOk = false;
        previewInfo = previewDiagnosticsToFailureInfo(previewRes.diagnostics);
        recordRunTimelineStage("preview_complete", "failed");
        resolved.appendGreenfieldRunLog(
          "preview",
          "failed",
          previewInfo.errorMessage,
          previewInfo.firstErrorLine ?? undefined,
        );
      } else {
        recordRunTimelineStage("preview_complete", "skipped");
        resolved.appendGreenfieldRunLog(
          "preview",
          "success",
          "Preview skipped (no preview script in package.json)",
        );
      }
    } catch (err) {
      previewOk = false;
      const msg = err instanceof Error ? err.message : "Preview could not start.";
      recordRunTimelineStage("preview_complete", "failed");
      previewInfo = {
        command: "npm run preview",
        exitCode: 1,
        port: null,
        stdout: "",
        stderr: "",
        errorMessage: msg,
        skippedBecauseBuildFailed: false,
        crashed: true,
      };
      resolved.appendGreenfieldRunLog("preview", "failed", msg);
    }

  }

  const failureReport = buildApplyPlanFailureReport({
    applyError: null,
    verification,
    verifyErr,
    ...(previewInfo ? { previewInfo } : {}),
  });
  let finalOverallOk = !verifyErr && verLines.ok && previewOk && applied.length > 0;
  let finalVerification = verification;
  let finalFailureReport = failureReport;
  let finalVerLines = verLines;

  if (
    !finalOverallOk &&
    verification &&
    !verifyErr &&
    applied.length > 0 &&
    !pipelineMode
  ) {
    const autoResult = await resolved.startAutoFixAfterApply({
      verification,
      applied,
      prompt,
      planSummary,
      planSource,
      failureLine: failureReport.rootCauseLine,
    });
    if (autoResult.ok && autoResult.verification) {
      finalOverallOk = true;
      finalVerification = autoResult.verification;
      finalVerLines = verificationSummaryLines(autoResult.verification);
      finalFailureReport = buildApplyPlanFailureReport({
        applyError: null,
        verification: autoResult.verification,
        verifyErr: null,
      });
      resolved.updateGreenfieldRun({ failureReport: null });
    }
  }

  const incompleteApply = evaluateIncompleteCoordinatedApply({
    prompt,
    targetPaths: planApplySession.files.map((f) => f.relPath),
    files: planApplySession.files,
  });
  if (incompleteApply.incomplete) {
    finalOverallOk = false;
    finalFailureReport = buildApplyPlanFailureReport({
      applyError: incompleteApply.message,
      verification: finalVerification,
      verifyErr,
      ...(previewInfo ? { previewInfo } : {}),
    });
  }

  if (staleResult("apply and verify")) {
    return {
      ok: finalOverallOk,
      verification: finalVerification,
      applied,
      ...(finalOverallOk ? {} : { error: finalFailureReport.rootCauseLine }),
    };
  }

  const frozenDiffs = freezePlanApplyFileDiffs(planApplySession.files, applied);
  if (frozenDiffs.length > 0) {
    resolved.updateGreenfieldRun({ appliedFileDiffs: frozenDiffs });
  }

  if (finalOverallOk && applied.length > 0) {
    const requirementSummary = summarizePostApplyRequirements({
      prompt,
      files: planApplySession.files,
      appliedPaths: applied,
      scan: resolved.scan,
      buildPassed: finalVerLines.build === "passed",
    });
    if (requirementSummary.advisoryNote) {
      resolved.appendGreenfieldRunLog(
        "apply_plan",
        "success",
        requirementSummary.advisoryNote,
        requirementSummary.failedLabels.join(", ") || undefined,
      );
    }
  }

  resolved.setPlanApplySession(null);

  if (!finalOverallOk) {
    resolved.setPlanApplyError(finalFailureReport.rootCauseLine);
    resolved.setSessionMemory((m) =>
      recordVerificationFailure(m, finalFailureReport.rootCauseLine),
    );
    resolved.publishFailureReport(finalFailureReport);
  } else {
    resolved.setPlanApplyError(null);
  }

  if (finalOverallOk) {
    resolved.completeApplyPlanRun(runId);
    void getIntelligenceHost()?.persistSessionMemory();
    if (!pipelineMode) {
      finalizeOrchestrationAfterApplyPlan(
        resolved,
        {
          prompt,
          filesWritten: applied,
          typecheckPassed: finalVerLines.typecheck === "passed",
          buildPassed: finalVerLines.build === "passed",
          previewOk,
        },
        finalVerification,
      );
    }
  }

  const latest = finalOverallOk
    ? formatApplyPlanSuccessLatestAction({
        prompt,
        filesWritten: applied,
        typecheckPassed: finalVerLines.typecheck === "passed",
        buildPassed: finalVerLines.build === "passed",
        previewOk,
      })
    : null;

  if (getActiveRunTimeline()) {
    if (finalOverallOk) {
      completeRunTimeline(latest?.summary ?? "apply_plan ok");
    } else {
      failRunTimeline(finalFailureReport.rootCauseLine);
    }
  }

  if (!pipelineMode) {
    resolved.finishStudioAction(
      "apply_plan",
      "apply_plan",
      finalOverallOk,
      latest?.summary ??
        (finalOverallOk ? "Apply Plan completed" : "Apply Plan finished with errors"),
      {
        details:
          latest?.detail ??
          (finalOverallOk
            ? `${applied.length} written · verification and preview ok`
            : finalFailureReport.rootCauseLine),
        patch: {
          verification: finalVerification,
          failureReport: finalOverallOk ? null : finalFailureReport,
          filesWritten: applied,
          workflow: {
            prompt,
            planSource,
            planSummary,
            filesAccepted: approved.length,
            filesWritten: applied,
            linesAdded: totals.linesAdded,
            linesRemoved: totals.linesRemoved,
            verificationOk: finalVerLines.ok,
            typecheckResult: finalVerLines.typecheck,
            buildResult: finalVerLines.build,
            errors: finalOverallOk ? [] : [finalFailureReport.rootCauseLine],
          },
        },
      },
    );
  }

  if (applied.length > 0) {
    resolved.setCanUndo(true);
    resolved.setLastEditedPath(applied[applied.length - 1] ?? null);
  }

  if (finalOverallOk && resolved.recordFollowUpStudioMessage) {
    const snapshotFiles = approved
      .filter((f) => applied.includes(f.relPath))
      .map((f) => ({
        relPath: f.relPath,
        absPath: f.absPath,
        content: f.proposal!.newContent,
      }));
    resolved.recordFollowUpStudioMessage(
      planSummary || latest?.summary || "Changes applied successfully.",
      {
        filesModified: applied,
        typecheckPassed: finalVerLines.typecheck === "passed",
        buildPassed: finalVerLines.build === "passed",
        verification: finalVerification,
        snapshotFiles,
      },
    );
  }

  if (finalOverallOk && !pipelineMode) {
    resolved.archiveActiveRunContextAfterSuccess?.();
  }

  if (
    finalOverallOk &&
    previewUrl &&
    finalVerification &&
    !pipelineMode &&
    !verifyErr &&
    resolved.api
  ) {
    schedulePostApplyUiAudit(
      {
        api: resolved.api,
        appendGreenfieldRunLog: resolved.appendGreenfieldRunLog,
        updateGreenfieldRun: resolved.updateGreenfieldRun,
      },
      {
        folderPath: project.path,
        previewUrl,
        userPrompt: prompt,
        verification: finalVerification,
      },
    );
  }

  return {
    ok: finalOverallOk,
    verification: finalVerification,
    applied,
    ...(finalOverallOk ? {} : { error: finalFailureReport.rootCauseLine }),
  };
}
