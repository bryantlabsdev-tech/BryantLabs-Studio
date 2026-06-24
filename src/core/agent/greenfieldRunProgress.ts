import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import type { ProviderId } from "@/core/providers/types";
import { isGreenfieldRunActive } from "@/core/agent/agentRunMutex";
import { getRunDurationMs, isRunTerminal } from "@/core/agent/runTerminal";
import { buildFollowUpActivityStream } from "@/core/build/followUpRun";

export const GREENFIELD_STUCK_THRESHOLDS = {
  WAITING_60_MS: 60_000,
  WAITING_120_MS: 120_000,
  WAITING_180_MS: 180_000,
  POSSIBLY_STUCK_MS: 5 * 60_000,
  STALE_MS: 10 * 60_000,
} as const;

export type GreenfieldProgressStepId =
  | "routing"
  | "generating"
  | "parsing"
  | "review"
  | "writing"
  | "npm"
  | "typescript"
  | "build"
  | "preview"
  | "ui_audit";

export type GreenfieldStepStatus = "pending" | "running" | "done" | "failed";

export type GreenfieldStuckLevel =
  | "none"
  | "waiting_60"
  | "waiting_120"
  | "waiting_180"
  | "possibly_stuck_5m";

export interface GreenfieldProgressStep {
  readonly id: GreenfieldProgressStepId;
  readonly label: string;
  readonly status: GreenfieldStepStatus;
}

export interface GreenfieldRunProgress {
  readonly isActive: boolean;
  readonly currentStage: GreenfieldProgressStepId;
  readonly currentStageLabel: string;
  readonly steps: readonly GreenfieldProgressStep[];
  readonly provider: string | null;
  readonly model: string | null;
  readonly elapsedMs: number;
  readonly latestEvent: string | null;
  readonly lastProgressAt: number | null;
  readonly stuckLevel: GreenfieldStuckLevel;
  readonly stuckMessage: string | null;
  readonly composerLabel: string;
  readonly activity: ReturnType<typeof buildFollowUpActivityStream>;
}

const STEP_DEFS: ReadonlyArray<{ id: GreenfieldProgressStepId; label: string }> = [
  { id: "routing", label: "Routing" },
  { id: "generating", label: "Generating files" },
  { id: "parsing", label: "Parsing files" },
  { id: "review", label: "Review / Auto-write" },
  { id: "writing", label: "Writing files" },
  { id: "npm", label: "npm install" },
  { id: "typescript", label: "TypeScript" },
  { id: "build", label: "Build" },
  { id: "preview", label: "Preview" },
  { id: "ui_audit", label: "UI audit" },
];

const STAGE_TO_STEP: Partial<Record<GreenfieldRunLogEntry["stage"], GreenfieldProgressStepId>> = {
  folder: "routing",
  provider: "routing",
  prompt: "routing",
  generation: "generating",
  provider_response: "generating",
  parser: "parsing",
  review: "review",
  approve: "review",
  write: "writing",
  npm_install: "npm",
  typescript: "typescript",
  build: "build",
  preview: "preview",
  ui_audit: "ui_audit",
  ui_repair: "ui_audit",
  greenfield_repair: "typescript",
};

export function formatGreenfieldElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function lastEntryTimestamp(entries: readonly GreenfieldRunLogEntry[]): number | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const ts = Date.parse(entries[i]?.timestamp ?? "");
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
}

function stepStatusForStage(
  stepId: GreenfieldProgressStepId,
  run: GreenfieldRunSnapshot,
  entries: readonly GreenfieldRunLogEntry[],
): GreenfieldStepStatus {
  // Snapshot fields are authoritative — log rows may leave "generation" as running.
  if (stepId === "generating") {
    if (run.genStatus === "running") return "running";
    if (run.genStatus === "done") return "done";
    if (run.genStatus === "error") return "failed";
  }
  if (stepId === "parsing") {
    if (run.genStatus === "error") return "failed";
    if (run.generatedFiles && run.generatedFiles.length > 0) return "done";
  }
  if (stepId === "review") {
    if (run.writeStatus === "writing") return "done";
    if (run.writeStatus === "done") return "done";
    if (
      run.genStatus === "done" &&
      entries.some(
        (e) =>
          (e.stage === "review" || e.stage === "approve") && e.status === "success",
      )
    ) {
      return run.writeStatus === "idle" ? "running" : "done";
    }
  }
  if (stepId === "writing") {
    if (run.writeStatus === "writing") return "running";
    if (run.writeStatus === "done") return "done";
    if (run.writeStatus === "error" || run.writeStatus === "blocked") return "failed";
  }

  const related = entries.filter((e) => STAGE_TO_STEP[e.stage] === stepId);
  if (related.some((e) => e.status === "failed")) return "failed";
  if (related.some((e) => e.status === "running")) return "running";
  if (related.some((e) => e.status === "success")) return "done";
  if (stepId === "npm" || stepId === "typescript" || stepId === "build" || stepId === "preview" || stepId === "ui_audit") {
    if (run.setupStatus === "running" || run.setupStatus === "repairing") {
      const activeStep =
        stepId === "npm"
          ? entries.some((e) => e.stage === "npm_install" && e.status === "running")
          : stepId === "typescript"
            ? entries.some((e) => e.stage === "typescript" && e.status === "running")
            : stepId === "build"
              ? entries.some((e) => e.stage === "build" && e.status === "running")
              : stepId === "preview"
                ? entries.some((e) => e.stage === "preview" && e.status === "running")
                : entries.some(
                    (e) =>
                      (e.stage === "ui_audit" || e.stage === "ui_repair") &&
                      e.status === "running",
                  );
      if (activeStep) return "running";
    }
    if (run.setupStatus === "done") {
      if (stepId === "ui_audit") {
        if (run.uiAuditResult?.ok || run.uiAuditResult?.skipped || run.uiAuditResult?.advisory) {
          return "done";
        }
        if (
          run.runResult === "success" &&
          entries.some((e) => e.stage === "ui_audit" && e.status === "success")
        ) {
          return "done";
        }
        if (entries.some((e) => e.stage === "ui_audit" && e.status === "failed")) {
          return "failed";
        }
        if (entries.some((e) => e.stage === "ui_audit" && e.status === "success")) {
          return "done";
        }
        if (entries.some((e) => e.stage === "ui_audit" && e.status === "running")) {
          return "running";
        }
        return "pending";
      }
      if (stepId === "preview") {
        return entries.some((e) => e.stage === "preview" && e.status === "success")
          ? "done"
          : entries.some((e) => e.stage === "preview" && e.status === "running")
            ? "running"
            : "pending";
      }
      if (related.some((e) => e.status === "success")) return "done";
    }
    if (run.setupStatus === "error" || run.setupStatus === "repair_needed") {
      if (related.some((e) => e.status === "failed")) return "failed";
    }
  }

  return "pending";
}

function stageFromLatestAction(
  run: GreenfieldRunSnapshot,
): GreenfieldProgressStepId | null {
  const stage = run.latestAction?.stage;
  if (!stage) return null;
  return STAGE_TO_STEP[stage] ?? null;
}

function resolveCurrentStage(
  steps: readonly GreenfieldProgressStep[],
  run: GreenfieldRunSnapshot,
): GreenfieldProgressStepId {
  const fromAction = stageFromLatestAction(run);
  if (fromAction) {
    const step = steps.find((s) => s.id === fromAction);
    if (step && (step.status === "running" || step.status === "done")) {
      return fromAction;
    }
  }

  const running = steps.find((s) => s.status === "running");
  if (running) return running.id;
  const failed = steps.find((s) => s.status === "failed");
  if (failed) return failed.id;
  const lastDone = [...steps].reverse().find((s) => s.status === "done");
  if (lastDone) {
    const idx = steps.findIndex((s) => s.id === lastDone.id);
    const next = steps[idx + 1];
    return next?.id ?? lastDone.id;
  }
  return "routing";
}

function deriveStuckLevel(
  isActive: boolean,
  lastProgressAt: number | null,
  runStartedAt: number | null,
  now: number,
): { level: GreenfieldStuckLevel; message: string | null } {
  if (!isActive) return { level: "none", message: null };
  const anchor = lastProgressAt ?? runStartedAt;
  if (!anchor) return { level: "none", message: null };

  const idleMs = now - anchor;
  const totalMs = runStartedAt ? now - runStartedAt : idleMs;

  if (totalMs >= GREENFIELD_STUCK_THRESHOLDS.POSSIBLY_STUCK_MS) {
    return {
      level: "possibly_stuck_5m",
      message: "This run has exceeded 5 minutes and may be stuck.",
    };
  }
  if (idleMs >= GREENFIELD_STUCK_THRESHOLDS.WAITING_180_MS) {
    return {
      level: "waiting_180",
      message: "No progress for 3 minutes. You can cancel, retry, or switch provider.",
    };
  }
  if (idleMs >= GREENFIELD_STUCK_THRESHOLDS.WAITING_120_MS) {
    return {
      level: "waiting_120",
      message: "This is taking longer than expected.",
    };
  }
  if (idleMs >= GREENFIELD_STUCK_THRESHOLDS.WAITING_60_MS) {
    return {
      level: "waiting_60",
      message: "Still waiting for provider…",
    };
  }
  return { level: "none", message: null };
}

function providerLabel(run: GreenfieldRunSnapshot): string | null {
  const id = run.provider;
  if (!id) return null;
  return id in PROVIDER_DISPLAY_LABELS
    ? PROVIDER_DISPLAY_LABELS[id as ProviderId]
    : id;
}

export function deriveGreenfieldRunProgress(
  run: GreenfieldRunSnapshot,
  panelActive: boolean,
  now = Date.now(),
): GreenfieldRunProgress | null {
  if (isRunTerminal(run, now)) return null;
  const isActive = isGreenfieldRunActive(run, panelActive) || panelActive;
  if (!isActive && run.actionType !== "greenfield") return null;
  if (!isActive) return null;

  const steps = STEP_DEFS.map(({ id, label }) => ({
    id,
    label,
    status: stepStatusForStage(id, run, run.entries),
  }));

  const currentStage = resolveCurrentStage(steps, run);
  const currentStep = steps.find((s) => s.id === currentStage);
  const currentStageLabel = currentStep?.label ?? "Creating app";

  const runStartedAt =
    run.runStartedAt ?? lastEntryTimestamp(run.entries) ?? null;
  const lastProgressAt = lastEntryTimestamp(run.entries) ?? runStartedAt;
  const elapsedMs = getRunDurationMs(run, now);

  const lastEntry = run.entries[run.entries.length - 1];
  const latestEvent =
    run.latestAction?.summary ??
    lastEntry?.message ??
    run.finalMessage ??
    null;

  const { level: stuckLevel, message: stuckMessage } = deriveStuckLevel(
    isActive,
    lastProgressAt,
    runStartedAt,
    now,
  );

  const provider = providerLabel(run);
  const model = run.model;
  const elapsed = formatGreenfieldElapsed(elapsedMs);
  const providerPart = provider
    ? `${provider}${model ? ` (${model})` : ""}`
    : "provider";

  return {
    isActive,
    currentStage,
    currentStageLabel,
    steps,
    provider,
    model,
    elapsedMs,
    latestEvent,
    lastProgressAt,
    stuckLevel,
    stuckMessage,
    composerLabel: `Creating app… ${currentStageLabel} with ${providerPart}… ${elapsed} elapsed`,
    activity: buildFollowUpActivityStream(run.entries, null),
  };
}
