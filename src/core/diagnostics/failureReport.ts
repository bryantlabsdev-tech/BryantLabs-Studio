import {
  formatCommandLog,
  pickFirstRealError,
} from "@/core/greenfield/failureInvestigation";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import {
  buildTypeScriptCheckDetailsFromCommand,
  formatTypeScriptDiagnosticsSummarySection,
  type TypeScriptCheckDetails,
  type TypeScriptDiagnostic,
} from "@/core/greenfield/tscDiagnostics";
import type { RunLogStage } from "@/core/greenfield/runLog";
import type { CommandResult, VerificationResult } from "@/types";

/** Map pipeline stage to run-log stage for timeline labels. */
export function pipelineStageToRunLogStage(stage: PipelineStage): RunLogStage {
  switch (stage) {
    case "patch_propose":
    case "write":
      return "apply_plan";
    case "npm_install":
      return "npm_install";
    case "typescript":
      return "typescript";
    case "build":
      return "build";
    case "preview":
      return "preview";
    case "verification":
      return "verification";
    default:
      return "error";
  }
}

export type FailureRole = "root" | "downstream" | "skipped" | "none";

export type PipelineStage =
  | "patch_propose"
  | "write"
  | "npm_install"
  | "typescript"
  | "build"
  | "preview"
  | "verification";

export type StageOutcome = "success" | "failed" | "skipped" | "not_run";

export interface PreviewFailureInfo {
  readonly command: string;
  readonly exitCode: number | null;
  readonly port: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage: string;
  readonly skippedBecauseBuildFailed: boolean;
  readonly crashed: boolean;
  readonly cwd?: string;
  readonly portInUse?: boolean;
  readonly distExists?: boolean;
  readonly hasPreviewScript?: boolean;
  readonly previewScript?: string | null;
  readonly firstErrorLine?: string | null;
  readonly triedPorts?: readonly number[];
}

export function formatPreviewFailureDetail(info: PreviewFailureInfo): string {
  return [
    info.errorMessage,
    "",
    `Command: ${info.command}`,
    info.cwd ? `Working directory: ${info.cwd}` : null,
    `Exit code: ${info.exitCode ?? "—"}`,
    info.port !== null ? `Port: ${info.port}` : null,
    info.portInUse !== undefined
      ? `Port in use: ${info.portInUse ? "yes" : "no"}`
      : null,
    info.distExists !== undefined
      ? `dist exists: ${info.distExists ? "yes" : "no"}`
      : null,
    info.hasPreviewScript !== undefined
      ? `preview script: ${info.hasPreviewScript ? info.previewScript ?? "(set)" : "missing"}`
      : null,
    info.triedPorts?.length ? `Tried ports: ${info.triedPorts.join(", ")}` : null,
    info.firstErrorLine ? `First error: ${info.firstErrorLine}` : null,
    info.skippedBecauseBuildFailed
      ? "Preview was not started because verification failed first."
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build preview failure info with only defined optional fields (exactOptionalPropertyTypes). */
export function mergePreviewFailureInfo(
  previewError: string,
  previewMeta: Partial<PreviewFailureInfo> | undefined,
  skippedBecauseBuildFailed: boolean,
): PreviewFailureInfo {
  const info: PreviewFailureInfo = {
    command: previewMeta?.command ?? "npm run preview",
    exitCode: previewMeta?.exitCode ?? 1,
    port: previewMeta?.port ?? 4173,
    stdout: previewMeta?.stdout ?? "",
    stderr: previewMeta?.stderr ?? "",
    errorMessage: previewError,
    skippedBecauseBuildFailed,
    crashed: previewMeta?.crashed ?? false,
  };
  const out: PreviewFailureInfo = { ...info };
  if (previewMeta?.cwd !== undefined) Object.assign(out, { cwd: previewMeta.cwd });
  if (previewMeta?.portInUse !== undefined)
    Object.assign(out, { portInUse: previewMeta.portInUse });
  if (previewMeta?.distExists !== undefined)
    Object.assign(out, { distExists: previewMeta.distExists });
  if (previewMeta?.hasPreviewScript !== undefined) {
    Object.assign(out, { hasPreviewScript: previewMeta.hasPreviewScript });
    if (previewMeta.previewScript !== undefined)
      Object.assign(out, { previewScript: previewMeta.previewScript });
  }
  if (previewMeta?.firstErrorLine !== undefined)
    Object.assign(out, { firstErrorLine: previewMeta.firstErrorLine });
  if (previewMeta?.triedPorts !== undefined)
    Object.assign(out, { triedPorts: previewMeta.triedPorts });
  return out;
}

export function buildPreviewOnlyFailureReport(
  info: PreviewFailureInfo,
): StudioFailureReport {
  return {
    rootStage: "preview",
    rootCauseLine: `Preview failed — ${info.errorMessage}`,
    stages: [
      stage({
        stage: "preview",
        outcome: "failed",
        role: info.skippedBecauseBuildFailed ? "downstream" : "root",
        headline: info.skippedBecauseBuildFailed
          ? "Preview failed (downstream)"
          : info.crashed
            ? "Preview server crashed"
            : "Preview failed to start",
        detail: formatPreviewFailureDetail(info),
        previewInfo: info,
      }),
    ],
  };
}

export interface StageFailureReport {
  readonly stage: PipelineStage;
  readonly outcome: StageOutcome;
  readonly role: FailureRole;
  readonly headline: string;
  readonly detail?: string;
  readonly command?: CommandResult;
  readonly typecheckDetails?: TypeScriptCheckDetails;
  readonly previewInfo?: PreviewFailureInfo;
}

export interface StudioFailureReport {
  readonly rootStage: PipelineStage | null;
  readonly rootCauseLine: string;
  readonly stages: readonly StageFailureReport[];
}

export function formatTypeScriptRootCauseLine(
  diagnostic: TypeScriptDiagnostic,
): string {
  return `TypeScript failed in ${diagnostic.file}:${diagnostic.line}:${diagnostic.column} — ${diagnostic.code} — ${diagnostic.message}`;
}

export function formatTypeScriptRootCauseFromDetails(
  details: TypeScriptCheckDetails,
): string {
  const first =
    pickFirstRealError(details.diagnostics) ??
    details.diagnostics.find((d) => d.category === "error") ??
    details.diagnostics[0];
  if (first) return formatTypeScriptRootCauseLine(first);
  return `TypeScript failed (exit ${details.exitCode ?? "—"}) — see command output`;
}

/** First actionable build error line from npm/vite/tsc output. */
export function parseBuildFirstError(cmd: CommandResult): string | null {
  const combined = `${cmd.stderr}\n${cmd.stdout}`;
  const lines = combined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/error TS\d+/i.test(line)) return line;
    if (/^\s*error\s/i.test(line)) return line;
    if (/failed|ERROR|✘|×/i.test(line) && line.length < 500) return line;
    if (/:\d+:\d+/.test(line) && /error/i.test(line)) return line;
  }
  return lines[0] ?? null;
}

export function formatBuildRootCauseLine(cmd: CommandResult): string {
  const first = parseBuildFirstError(cmd);
  const base = `Build failed — ${cmd.command} — exit ${cmd.exitCode ?? "—"}`;
  return first ? `${base} — ${first}` : base;
}

function stage(
  partial: Omit<StageFailureReport, "role"> & { role?: FailureRole },
): StageFailureReport {
  return { role: "none", ...partial };
}

export function buildVerificationFailureReport(
  verification: VerificationResult | null,
  verifyErr: string | null,
): StudioFailureReport {
  if (verifyErr) {
    return {
      rootStage: "verification",
      rootCauseLine: `Verification failed — ${verifyErr}`,
      stages: [
        stage({
          stage: "verification",
          outcome: "failed",
          role: "root",
          headline: "Verification failed to run",
          detail: verifyErr,
        }),
        stage({ stage: "typescript", outcome: "not_run", headline: "TypeScript not run" }),
        stage({ stage: "build", outcome: "not_run", headline: "Build not run" }),
      ],
    };
  }

  if (!verification) {
    return {
      rootStage: null,
      rootCauseLine: "Verification did not run",
      stages: [],
    };
  }

  const tcDetails = buildTypeScriptCheckDetailsFromCommand(verification.typecheck);
  const stages: StageFailureReport[] = [
    stage({
      stage: "verification",
      outcome:
        verification.typecheck.ok && verification.build.ok ? "success" : "failed",
      role: "none",
      headline:
        verification.typecheck.ok && verification.build.ok
          ? "Verification passed"
          : "Verification failed",
    }),
    stage({
      stage: "typescript",
      outcome: verification.typecheck.ok ? "success" : "failed",
      role: verification.typecheck.ok ? "none" : "root",
      headline: verification.typecheck.ok
        ? "TypeScript passed"
        : "TypeScript failed",
      detail: commandSummary(verification.typecheck),
      command: verification.typecheck,
      ...(tcDetails ? { typecheckDetails: tcDetails } : {}),
    }),
  ];

  let rootStage: PipelineStage | null = null;
  let rootCauseLine = "Verification passed";

  if (!verification.typecheck.ok) {
    rootStage = "typescript";
    rootCauseLine = formatTypeScriptRootCauseFromDetails(tcDetails);
    stages.push(
      stage({
        stage: "build",
        outcome: verification.build.ok ? "skipped" : "failed",
        role: "downstream",
        headline: verification.build.ok
          ? "Build skipped (TypeScript failed first)"
          : "Build failed (downstream — TypeScript failed first)",
        detail: verification.build.ok
          ? "Build was not the first failure; fix TypeScript errors first."
          : `${formatBuildRootCauseLine(verification.build)}. TypeScript already failed before this build run.`,
        command: verification.build,
      }),
    );
  } else if (!verification.build.ok) {
    rootStage = "build";
    rootCauseLine = formatBuildRootCauseLine(verification.build);
    stages[1] = { ...stages[1]!, role: "none" };
    stages.push(
      stage({
        stage: "build",
        outcome: "failed",
        role: "root",
        headline: "Build failed",
        detail: formatBuildRootCauseLine(verification.build),
        command: verification.build,
      }),
    );
  } else {
    stages.push(
      stage({
        stage: "build",
        outcome: "success",
        role: "none",
        headline: "Build passed",
        detail: commandSummary(verification.build),
        command: verification.build,
      }),
    );
  }

  return { rootStage, rootCauseLine, stages };
}

export function buildApplyPlanZeroProposalsReport(opts: {
  diagnostics: readonly { path: string; reason: string }[];
  collectionSkipped?: readonly string[];
  rootCauseLine?: string;
  rawModelOutput?: string | null;
  selectedFiles?: readonly string[];
  patchTargets?: readonly string[];
  plannerOutput?: string | null;
  routeSelectionHint?: string | null;
}): StudioFailureReport {
  const rootCauseLine =
    opts.rootCauseLine ?? "Apply Plan produced zero valid patch proposals.";
  const lines = [
    rootCauseLine,
    "",
    "Per-file results:",
    ...opts.diagnostics.map((d) => `  ${d.path}: ${d.reason}`),
  ];
  if (opts.selectedFiles?.length) {
    lines.push("", "Selected files:", ...opts.selectedFiles.map((p) => `  ${p}`));
  }
  if (opts.patchTargets?.length) {
    lines.push("", "Patch targets:", ...opts.patchTargets.map((p) => `  ${p}`));
  }
  if (opts.plannerOutput?.trim()) {
    lines.push("", "Planner output (truncated):", opts.plannerOutput.slice(0, 4000));
  }
  if (opts.routeSelectionHint?.trim()) {
    lines.push("", "Route selection:", opts.routeSelectionHint);
  }
  if (opts.collectionSkipped?.length) {
    lines.push(
      "",
      "Targets excluded before proposing:",
      ...opts.collectionSkipped.map((s) => `  ${s}`),
    );
  }
  if (opts.rawModelOutput?.trim()) {
    lines.push(
      "",
      "Raw model output (truncated):",
      opts.rawModelOutput.slice(0, 8000),
    );
  }
  return {
    rootStage: "patch_propose",
    rootCauseLine,
    stages: [
      stage({
        stage: "patch_propose",
        outcome: "failed",
        role: "root",
        headline: "No patch proposals generated",
        detail: lines.join("\n"),
      }),
    ],
  };
}

export function buildApplyPlanFailureReport(opts: {
  applyError?: string | null;
  proposeError?: string | null;
  proposeFile?: string | null;
  verification?: VerificationResult | null;
  verifyErr?: string | null;
  previewInfo?: PreviewFailureInfo | null;
}): StudioFailureReport {
  if (opts.applyError) {
    return {
      rootStage: "write",
      rootCauseLine: `Write failed — ${opts.applyError}`,
      stages: [
        stage({
          stage: "write",
          outcome: "failed",
          role: "root",
          headline: "Apply Plan write failed",
          detail: opts.applyError,
        }),
        stage({
          stage: "typescript",
          outcome: "not_run",
          headline: "TypeScript not run (write failed first)",
        }),
        stage({
          stage: "build",
          outcome: "not_run",
          headline: "Build not run (write failed first)",
        }),
      ],
    };
  }

  if (opts.proposeError) {
    return {
      rootStage: "patch_propose",
      rootCauseLine: `Patch proposal failed${opts.proposeFile ? ` — ${opts.proposeFile}` : ""} — ${opts.proposeError}`,
      stages: [
        stage({
          stage: "patch_propose",
          outcome: "failed",
          role: "root",
          headline: "Patch proposal failed",
          detail: opts.proposeFile
            ? `${opts.proposeFile}: ${opts.proposeError}`
            : opts.proposeError,
        }),
      ],
    };
  }

  const verifyReport = buildVerificationFailureReport(
    opts.verification ?? null,
    opts.verifyErr ?? null,
  );

  if (opts.previewInfo) {
    const v = opts.verification;
    const buildFailed =
      v != null && (!v.build.ok || !v.typecheck.ok);
    const previewStages = [...verifyReport.stages];
    previewStages.push(
      stage({
        stage: "preview",
        outcome: "failed",
        role: buildFailed ? "downstream" : "root",
        headline: opts.previewInfo.skippedBecauseBuildFailed
          ? "Preview skipped (build/typecheck failed)"
          : opts.previewInfo.crashed
            ? "Preview server crashed"
            : "Preview failed to start",
        detail: formatPreviewFailureDetail(opts.previewInfo),
        previewInfo: opts.previewInfo,
      }),
    );

    if (!buildFailed) {
      return {
        rootStage: "preview",
        rootCauseLine: `Preview failed — ${opts.previewInfo.errorMessage}`,
        stages: previewStages,
      };
    }

    return {
      ...verifyReport,
      stages: previewStages,
      rootCauseLine: verifyReport.rootCauseLine,
    };
  }

  return verifyReport;
}

export function buildGreenfieldSetupFailureReport(
  setup: GreenfieldSetupResult,
  previewError?: string | null,
  previewMeta?: Partial<PreviewFailureInfo>,
): StudioFailureReport {
  const stages: StageFailureReport[] = [];

  stages.push(
    stage({
      stage: "npm_install",
      outcome: setup.install.ok ? "success" : "failed",
      role: setup.install.ok ? "none" : "root",
      headline: setup.install.ok ? "npm install passed" : "npm install failed",
      detail: commandSummary(setup.install),
      command: setup.install,
    }),
  );

  if (!setup.install.ok) {
    return {
      rootStage: "npm_install",
      rootCauseLine: `npm install failed — exit ${setup.install.exitCode ?? "—"} — ${parseBuildFirstError(setup.install) ?? setup.error ?? "see output"}`,
      stages,
    };
  }

  const tc = setup.typecheck;
  const tcDetails =
    setup.typecheckDetails ??
    (tc && !tc.ok ? buildTypeScriptCheckDetailsFromCommand(tc) : undefined);

  if (tc) {
    stages.push(
      stage({
        stage: "typescript",
        outcome: tc.ok ? "success" : "failed",
        role: tc.ok ? "none" : "root",
        headline: tc.ok ? "TypeScript passed" : "TypeScript failed",
        detail: commandSummary(tc),
        command: tc,
        ...(tcDetails ? { typecheckDetails: tcDetails } : {}),
      }),
    );
  }

  const build = setup.build;
  if (build) {
    const tsFailed = tc && !tc.ok;
    stages.push(
      stage({
        stage: "build",
        outcome: build.ok ? "success" : "failed",
        role: build.ok ? "none" : tsFailed ? "downstream" : "root",
        headline: build.ok
          ? "Build passed"
          : tsFailed
            ? "Build failed (downstream — TypeScript failed first)"
            : "Build failed",
        detail: tsFailed
          ? `${formatBuildRootCauseLine(build)}. TypeScript already failed.`
          : formatBuildRootCauseLine(build),
        command: build,
      }),
    );
  }

  let rootStage: PipelineStage = "npm_install";
  let rootCauseLine = setup.error ?? "Setup failed";

  if (tc && !tc.ok && tcDetails) {
    rootStage = "typescript";
    rootCauseLine = formatTypeScriptRootCauseFromDetails(tcDetails);
  } else if (build && !build.ok) {
    rootStage = "build";
    rootCauseLine = formatBuildRootCauseLine(build);
  }

  if (previewError) {
    const buildOrTsFailed = (tc && !tc.ok) || (build && !build.ok);
    stages.push(
      stage({
        stage: "preview",
        outcome: "failed",
        role: buildOrTsFailed ? "downstream" : "root",
        headline: buildOrTsFailed
          ? "Preview failed (downstream)"
          : "Preview failed to start",
        detail: formatPreviewFailureDetail(
          mergePreviewFailureInfo(
            previewError,
            previewMeta,
            Boolean(buildOrTsFailed),
          ),
        ),
        previewInfo: mergePreviewFailureInfo(
          previewError,
          previewMeta,
          Boolean(buildOrTsFailed),
        ),
      }),
    );
    if (!buildOrTsFailed) {
      rootStage = "preview";
      rootCauseLine = `Preview failed — ${previewError}`;
    }
  }

  return { rootStage, rootCauseLine, stages };
}

export function resolveStudioFailureReport(opts: {
  failureReport: StudioFailureReport | null;
  setupResult: GreenfieldSetupResult | null;
  verification: VerificationResult | null;
  verifyErr?: string | null;
}): StudioFailureReport | null {
  if (opts.failureReport) return opts.failureReport;
  if (opts.setupResult && !opts.setupResult.ok) {
    return buildGreenfieldSetupFailureReport(opts.setupResult);
  }
  if (
    opts.verification &&
    (!opts.verification.typecheck.ok || !opts.verification.build.ok)
  ) {
    return buildVerificationFailureReport(opts.verification, opts.verifyErr ?? null);
  }
  if (opts.verifyErr) {
    return buildVerificationFailureReport(null, opts.verifyErr);
  }
  return null;
}

function commandSummary(cmd: CommandResult): string {
  return `${cmd.command} · exit ${cmd.exitCode ?? "—"} · ${cmd.durationMs}ms${cmd.timedOut ? " · timed out" : ""}${cmd.truncated ? " · truncated" : ""}`;
}

export function formatFailureReportRootCauseCopy(report: StudioFailureReport): string {
  return ["Studio failure — root cause", "", report.rootCauseLine].join("\n");
}

export function formatFailureReportFullCopy(report: StudioFailureReport): string {
  const lines: string[] = [
    "Studio failure diagnostics",
    "========================",
    "",
    `Root cause: ${report.rootCauseLine}`,
    report.rootStage ? `First failure stage: ${report.rootStage}` : "",
    "",
    "--- pipeline stages ---",
  ];

  for (const s of report.stages) {
    const roleLabel =
      s.role === "root"
        ? "ROOT FAILURE"
        : s.role === "downstream"
          ? "DOWNSTREAM"
          : s.role === "skipped"
            ? "SKIPPED"
            : "";
    lines.push(
      "",
      `[${s.stage}] ${s.outcome}${roleLabel ? ` — ${roleLabel}` : ""}`,
      s.headline,
    );
    if (s.detail) lines.push(s.detail);
    if (s.typecheckDetails) {
      lines.push("", formatTypeScriptDiagnosticsSummarySection(s.typecheckDetails));
    }
    if (s.command) {
      lines.push("", formatCommandLog(s.stage, s.command));
    }
    if (s.previewInfo) {
      lines.push("", formatPreviewFailureDetail(s.previewInfo));
      lines.push(
        "",
        "--- preview stdout ---",
        s.previewInfo.stdout || "(empty)",
        "--- preview stderr ---",
        s.previewInfo.stderr || "(empty)",
      );
    }
  }

  return lines.join("\n");
}

/** Append run-log lines for stages in a failure report (observability only). */
export function failureReportToRunLogEntries(
  report: StudioFailureReport,
): Array<{
  stage: RunLogStage;
  status: "success" | "failed";
  message: string;
  detail?: string;
  failureRole?: FailureRole;
}> {
  const out: Array<{
    stage: RunLogStage;
    status: "success" | "failed";
    message: string;
    detail?: string;
    failureRole?: FailureRole;
  }> = [];
  for (const s of report.stages) {
    if (s.outcome === "not_run") continue;
    out.push({
      stage: pipelineStageToRunLogStage(s.stage),
      status: s.outcome === "success" ? "success" : "failed",
      message: s.headline,
      ...(s.detail ? { detail: s.detail } : {}),
      ...(s.role !== "none" ? { failureRole: s.role } : {}),
    });
  }
  return out;
}

export function formatFailureReportCommandOutputCopy(
  report: StudioFailureReport,
): string {
  const sections: string[] = ["Studio failure — command output", ""];
  for (const s of report.stages) {
    if (!s.command && !s.typecheckDetails && !s.previewInfo) continue;
    sections.push(`=== ${s.stage} (${s.role === "root" ? "ROOT" : s.role}) ===`);
    if (s.command) sections.push(formatCommandLog(s.stage, s.command));
    if (s.previewInfo) {
      sections.push(
        `stdout:\n${s.previewInfo.stdout || "(empty)"}`,
        `stderr:\n${s.previewInfo.stderr || "(empty)"}`,
      );
    }
    sections.push("");
  }
  return sections.join("\n");
}
