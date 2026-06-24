import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";
import {
  buildIncompleteRepairSuggestion,
  evaluateRequirementChecklist,
  type RequirementChecklistItem,
  type RequirementEvidence,
  type RequirementRepairSuggestion,
} from "@/core/agent/requirementVerification";
import {
  routeAgentPrompt,
  type AgentRouteDecisionTrace,
} from "@/core/agent/unifiedAgentRoute";
import {
  GREENFIELD_BLOCKED_BY_ROUTE_LABEL,
} from "@/core/agent/followUpExecution";
import {
  CREATE_TARGET_ACCEPTED_LABEL,
  CREATE_TARGET_REJECTED_LABEL,
  SCAFFOLD_TARGET_SKIPPED_LABEL,
} from "@/core/planApply/createFileTargets";
import { resolveRunVerification } from "@/core/diagnostics/verificationResolution";
import type { RunLogStatus } from "@/core/greenfield/runLog";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GeneratedFile } from "@/core/greenfield/types";
import type { ProjectScan } from "@/types";

export type AgentTraceEventKind =
  | "prompt_received"
  | "route_selected"
  | "greenfield_blocked"
  | "create_target_accepted"
  | "create_target_rejected"
  | "scaffold_target_skipped"
  | "mode_selected"
  | "files_scanned"
  | "files_read"
  | "plan_generated"
  | "file_edited"
  | "command_run"
  | "verification_result"
  | "preview_result"
  | "ui_audit_result"
  | "completion_reason";

export type AgentTraceFileEditKind = "created" | "modified" | "deleted";

export interface AgentTraceFileEdit {
  readonly path: string;
  readonly changeKind: AgentTraceFileEditKind;
  readonly summary: string;
}

export interface AgentTraceEvent {
  readonly id: string;
  readonly kind: AgentTraceEventKind;
  readonly timestamp: number;
  readonly time: string;
  readonly label: string;
  readonly detail: string | null;
  readonly status: RunLogStatus | "info";
  readonly fileEdit?: AgentTraceFileEdit;
}

export interface AgentTraceViewModel {
  readonly events: readonly AgentTraceEvent[];
  readonly checklist: readonly RequirementChecklistItem[];
  readonly checklistComplete: boolean;
  readonly completionReason: string | null;
  readonly routeDecision: AgentRouteDecisionTrace | null;
  readonly repairSuggestion: RequirementRepairSuggestion | null;
}

export interface BuildAgentTraceInput {
  readonly prompt: string;
  readonly route: string | null;
  readonly generationMode: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly fileDiffs: readonly RunFileDiff[];
  readonly scan?: ProjectScan | null;
  readonly scanStatus?: "idle" | "scanning" | "done" | "error";
  readonly fallbackSourceFileCount?: number;
  readonly routeDecision?: AgentRouteDecisionTrace | null;
  readonly outcome: RunTerminalOutcome | null;
}

export function formatRouteDecisionDetail(
  decision: AgentRouteDecisionTrace,
): string {
  const lines = [
    `Selected: ${decision.selectedRoute} (${decision.selectionReason})`,
    `Candidates: ${decision.candidates.join(", ")}`,
    `Source count used: ${decision.sourceCountUsed}`,
    `Scanned source count: ${decision.scannedSourceCount}`,
    `Fallback source count: ${decision.fallbackSourceCount}`,
  ];
  if (decision.greenfieldRejected) {
    lines.push(
      `Greenfield rejected: yes (${decision.greenfieldRejectReason ?? "unknown"})`,
    );
  } else {
    lines.push("Greenfield rejected: no");
  }
  return lines.join("\n");
}

function resolveRouteDecision(input: BuildAgentTraceInput): AgentRouteDecisionTrace {
  if (input.routeDecision) return input.routeDecision;
  if (input.greenfieldRun.routeDecision) return input.greenfieldRun.routeDecision;
  const run = input.greenfieldRun;
  const routed = routeAgentPrompt({
    prompt: input.prompt,
    projectOpen: Boolean(run.projectPath ?? run.targetFolder),
    projectPath: run.projectPath ?? run.targetFolder,
    scan: input.scan ?? null,
    scanStatus: input.scanStatus ?? "done",
    filesWritten: run.filesWritten,
    previousSuccessfulRun:
      run.runResult === "success" && run.filesWritten.length > 0,
    ...(input.fallbackSourceFileCount !== undefined
      ? { fallbackSourceFileCount: input.fallbackSourceFileCount }
      : {}),
  });
  return routed.decision;
}

function formatClockTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "--:--:--";
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function entryTimestamp(entry: GreenfieldRunLogEntry): number {
  const parsed = Date.parse(entry.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function detectChangeKind(diff: RunFileDiff): AgentTraceFileEditKind {
  const hadBefore = (diff.before?.length ?? 0) > 0;
  const hasAfter = (diff.after?.length ?? 0) > 0;
  if (!hadBefore && hasAfter) return "created";
  if (hadBefore && !hasAfter) return "deleted";
  return "modified";
}

function summarizeFileChange(diff: RunFileDiff): string {
  const kind = detectChangeKind(diff);
  const stats = `+${diff.linesAdded} / −${diff.linesRemoved} lines`;
  if (kind === "created") return `Created file (${stats})`;
  if (kind === "deleted") return `Deleted file (${stats})`;
  return `Modified file (${stats})`;
}

function makeEvent(
  id: string,
  kind: AgentTraceEventKind,
  timestamp: number,
  label: string,
  detail: string | null,
  status: RunLogStatus | "info",
  fileEdit?: AgentTraceFileEdit,
): AgentTraceEvent {
  return {
    id,
    kind,
    timestamp,
    time: formatClockTime(timestamp),
    label,
    detail,
    status,
    ...(fileEdit ? { fileEdit } : {}),
  };
}

function timelineStageTimestamp(
  run: GreenfieldRunSnapshot,
  stageId: string,
): number | null {
  const stage = run.runTimeline?.stages.find((item) => item.stage === stageId);
  return stage?.at ?? null;
}

function collectScannedFiles(
  run: GreenfieldRunSnapshot,
  scan: ProjectScan | null | undefined,
): string[] {
  const fromScan = scan?.files.map((file) => file.path) ?? [];
  const fromTimeline = run.runTimeline?.stages
    .filter((stage) => stage.stage === "audit_complete" && stage.detail)
    .flatMap((stage) => stage.detail!.split(/[,\n]+/).map((part) => part.trim()))
    .filter(Boolean) ?? [];
  return [...new Set([...fromScan, ...fromTimeline])];
}

function collectReadFiles(
  run: GreenfieldRunSnapshot,
  fileDiffs: readonly RunFileDiff[],
): string[] {
  const fromPlan = run.runTimeline?.stages
    .filter((stage) => stage.stage === "plan_complete" && stage.detail)
    .flatMap((stage) => stage.detail!.split(/[,\n]+/).map((part) => part.trim()))
    .filter(Boolean) ?? [];
  const fromDiffs = fileDiffs.map((diff) => diff.path);
  return [...new Set([...fromPlan, ...fromDiffs, ...run.filesWritten])];
}

function commandLabelForStage(stage: GreenfieldRunLogEntry["stage"]): string | null {
  switch (stage) {
    case "npm_install":
      return "npm install";
    case "typescript":
      return "TypeScript check";
    case "build":
      return "Build";
    default:
      return null;
  }
}

function buildCompletionReason(
  outcome: RunTerminalOutcome | null,
  checklistComplete: boolean,
  run: GreenfieldRunSnapshot,
): string | null {
  if (!outcome) return null;
  if (outcome === "incomplete") {
    return checklistComplete
      ? "Run finished but requirement verification failed"
      : "Build succeeded but one or more prompt requirements were not met";
  }
  if (outcome === "success") {
    return run.finalMessage?.trim() || "All steps completed successfully";
  }
  if (outcome === "failed") {
    return (
      run.failureReport?.rootCauseLine ??
      run.finalMessage?.trim() ??
      run.latestAction?.summary ??
      "Run failed"
    );
  }
  return run.finalMessage?.trim() || outcome;
}

export function buildAgentTrace(input: BuildAgentTraceInput): AgentTraceViewModel {
  const events: AgentTraceEvent[] = [];
  const run = input.greenfieldRun;
  const entries = run.entries;
  const startedAt =
    run.runStartedAt ??
    (entries[0] ? entryTimestamp(entries[0]) : Date.now());

  events.push(
    makeEvent(
      "trace-prompt",
      "prompt_received",
      startedAt,
      "Prompt received",
      input.prompt,
      "info",
    ),
  );

  const routeDecision = resolveRouteDecision(input);
  const selectedRoute =
    routeDecision.selectedRoute !== "pending"
      ? routeDecision.selectedRoute
      : input.route ?? run.runTimeline?.route ?? null;

  const routeAt =
    timelineStageTimestamp(run, "route") ??
    (selectedRoute ? startedAt + 1 : null);
  if (selectedRoute && routeAt != null) {
    events.push(
      makeEvent(
        "trace-route",
        "route_selected",
        routeAt,
        "Route selected",
        formatRouteDecisionDetail(routeDecision),
        routeDecision.selectedRoute === "greenfield" ? "info" : "success",
      ),
    );
  }

  const greenfieldBlockedEntry = entries.find(
    (entry) => entry.message === GREENFIELD_BLOCKED_BY_ROUTE_LABEL,
  );
  if (greenfieldBlockedEntry) {
    events.push(
      makeEvent(
        "trace-greenfield-blocked",
        "greenfield_blocked",
        entryTimestamp(greenfieldBlockedEntry),
        GREENFIELD_BLOCKED_BY_ROUTE_LABEL,
        greenfieldBlockedEntry.details ?? null,
        "info",
      ),
    );
  }

  for (const entry of entries) {
    if (entry.message === CREATE_TARGET_ACCEPTED_LABEL) {
      events.push(
        makeEvent(
          `trace-create-accepted-${entry.id}`,
          "create_target_accepted",
          entryTimestamp(entry),
          CREATE_TARGET_ACCEPTED_LABEL,
          entry.details ?? null,
          "success",
        ),
      );
      continue;
    }
    if (entry.message === CREATE_TARGET_REJECTED_LABEL) {
      events.push(
        makeEvent(
          `trace-create-rejected-${entry.id}`,
          "create_target_rejected",
          entryTimestamp(entry),
          CREATE_TARGET_REJECTED_LABEL,
          entry.details ?? null,
          "info",
        ),
      );
      continue;
    }
    if (entry.message === SCAFFOLD_TARGET_SKIPPED_LABEL) {
      events.push(
        makeEvent(
          `trace-scaffold-skipped-${entry.id}`,
          "scaffold_target_skipped",
          entryTimestamp(entry),
          SCAFFOLD_TARGET_SKIPPED_LABEL,
          entry.details ?? null,
          "info",
        ),
      );
    }
  }

  const mode = input.generationMode ?? run.actionType;
  if (mode && mode !== "idle") {
    events.push(
      makeEvent(
        "trace-mode",
        "mode_selected",
        routeAt ?? startedAt + 2,
        "Mode selected",
        mode,
        "info",
      ),
    );
  }

  const scannedFiles = collectScannedFiles(run, input.scan);
  const scanAt = timelineStageTimestamp(run, "audit_complete") ?? startedAt + 3;
  if (scannedFiles.length > 0) {
    events.push(
      makeEvent(
        "trace-scan",
        "files_scanned",
        scanAt,
        "Files scanned",
        `${scannedFiles.length} file(s): ${scannedFiles.slice(0, 8).join(", ")}${scannedFiles.length > 8 ? "…" : ""}`,
        "success",
      ),
    );
  }

  const readFiles = collectReadFiles(run, input.fileDiffs);
  const readAt = timelineStageTimestamp(run, "plan_complete") ?? scanAt + 1;
  if (readFiles.length > 0) {
    events.push(
      makeEvent(
        "trace-read",
        "files_read",
        readAt,
        "Files read",
        readFiles.slice(0, 12).join(", "),
        "info",
      ),
    );
  }

  const planEntry = entries.find(
    (entry) =>
      entry.stage === "ai_plan" ||
      entry.stage === "pipeline_planner" ||
      entry.message.toLowerCase().includes("plan"),
  );
  const planAt =
    timelineStageTimestamp(run, "plan_complete") ??
    (planEntry ? entryTimestamp(planEntry) : null);
  if (planAt != null) {
    events.push(
      makeEvent(
        "trace-plan",
        "plan_generated",
        planAt,
        "Plan generated",
        planEntry?.message ?? run.runTimeline?.stages.find((s) => s.stage === "plan_complete")?.detail ?? null,
        planEntry?.status ?? "success",
      ),
    );
  }

  for (const diff of input.fileDiffs) {
    const changeKind = detectChangeKind(diff);
    const editAt =
      entries.find((entry) => entry.stage === "write" || entry.stage === "apply_plan")
        ? entryTimestamp(
            entries.find((entry) => entry.stage === "write" || entry.stage === "apply_plan")!,
          ) + events.length
        : planAt ?? startedAt + events.length;
    events.push(
      makeEvent(
        `trace-edit-${diff.path}`,
        "file_edited",
        editAt,
        diff.path,
        summarizeFileChange(diff),
        "success",
        {
          path: diff.path,
          changeKind,
          summary: summarizeFileChange(diff),
        },
      ),
    );
  }

  for (const entry of entries) {
    const command = commandLabelForStage(entry.stage);
    if (!command) continue;
    events.push(
      makeEvent(
        `trace-cmd-${entry.id}`,
        "command_run",
        entryTimestamp(entry),
        command,
        entry.message,
        entry.status,
      ),
    );
  }

  const verification = resolveRunVerification({ run });
  const verificationEntry = entries.find((entry) => entry.stage === "verification");
  if (verificationEntry || verification.typescript !== "pending") {
    events.push(
      makeEvent(
        "trace-verification",
        "verification_result",
        verificationEntry ? entryTimestamp(verificationEntry) : startedAt + events.length,
        "Verification results",
        `TypeScript: ${verification.typescript}; Build: ${verification.build}`,
        verification.build === "failed" || verification.typescript === "failed"
          ? "failed"
          : "success",
      ),
    );
  }

  const previewEntry = entries.filter((entry) => entry.stage === "preview").at(-1);
  if (previewEntry || verification.preview !== "pending") {
    events.push(
      makeEvent(
        "trace-preview",
        "preview_result",
        previewEntry ? entryTimestamp(previewEntry) : startedAt + events.length,
        "Preview result",
        previewEntry?.message ?? `Preview: ${verification.preview}`,
        previewEntry?.status ?? (verification.preview === "passed" ? "success" : "info"),
      ),
    );
  }

  const uiAuditEntry = entries.filter((entry) => entry.stage === "ui_audit").at(-1);
  const audit = run.uiAuditResult;
  if (uiAuditEntry || audit) {
    const detail =
      audit?.details ??
      uiAuditEntry?.message ??
      (audit?.ok === true ? "UI audit passed" : audit?.ok === false ? "UI audit failed" : null);
    events.push(
      makeEvent(
        "trace-ui-audit",
        "ui_audit_result",
        uiAuditEntry ? entryTimestamp(uiAuditEntry) : startedAt + events.length,
        "UI audit result",
        detail,
        audit?.ok === false
          ? "failed"
          : audit?.ok === true || uiAuditEntry?.status === "success"
            ? "success"
            : "info",
      ),
    );
  }

  const resolvedVerification = resolveRunVerification({ run });
  const buildPassed =
    resolvedVerification.build === "passed" || resolvedVerification.build === "skipped";

  const checklistResult = evaluateRequirementChecklist({
    prompt: input.prompt,
    fileDiffs: input.fileDiffs,
    generatedFiles: run.generatedFiles,
    ...(input.scan ? { scan: input.scan } : {}),
    buildPassed,
  });

  const completionReason = buildCompletionReason(
    input.outcome,
    checklistResult.allSatisfied,
    run,
  );
  const endedAt =
    run.endedAt ??
    timelineStageTimestamp(run, "run_complete") ??
    (entries.at(-1) ? entryTimestamp(entries.at(-1)!) : startedAt + events.length);

  events.push(
    makeEvent(
      "trace-completion",
      "completion_reason",
      endedAt,
      input.outcome === "incomplete" ? "Run incomplete" : "Completion",
      completionReason,
      input.outcome === "success"
        ? "success"
        : input.outcome === "incomplete"
          ? "failed"
          : input.outcome === "failed"
            ? "failed"
            : "info",
    ),
  );

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const repairSuggestion =
    input.outcome === "incomplete"
      ? buildIncompleteRepairSuggestion(input.prompt, checklistResult.items)
      : null;

  return {
    events: sorted,
    checklist: checklistResult.items,
    checklistComplete: checklistResult.allSatisfied,
    completionReason,
    routeDecision,
    repairSuggestion,
  };
}

export function buildRequirementEvidence(input: {
  readonly prompt: string;
  readonly fileDiffs: readonly RunFileDiff[];
  readonly generatedFiles?: readonly GeneratedFile[] | null;
  readonly scan?: ProjectScan | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
}): RequirementEvidence {
  const resolvedVerification = resolveRunVerification({ run: input.greenfieldRun });
  const buildPassed =
    resolvedVerification.build === "passed" || resolvedVerification.build === "skipped";
  return {
    prompt: input.prompt,
    fileDiffs: input.fileDiffs,
    ...(input.generatedFiles ? { generatedFiles: input.generatedFiles } : {}),
    ...(input.scan ? { scan: input.scan } : {}),
    buildPassed,
  };
}
