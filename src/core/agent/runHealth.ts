import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import { isRunFailureOutcome } from "@/core/agent/runOutcome";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";

export type RunHealthTone = "green" | "yellow" | "red";

export interface RunHealthScore {
  readonly score: number;
  readonly tone: RunHealthTone;
  readonly breakdown: readonly { readonly label: string; readonly delta: number }[];
}

function stageSucceeded(
  entries: readonly GreenfieldRunLogEntry[],
  stage: GreenfieldRunLogEntry["stage"],
): boolean {
  return entries.some((entry) => entry.stage === stage && entry.status === "success");
}

function stageFailed(
  entries: readonly GreenfieldRunLogEntry[],
  stage: GreenfieldRunLogEntry["stage"],
): boolean {
  return entries.some((entry) => entry.stage === stage && entry.status === "failed");
}

function timelineStageOk(
  timeline: RunTimelineSnapshot | null | undefined,
  stage: string,
): boolean | null {
  if (!timeline) return null;
  const record = timeline.stages.find((item) => item.stage === stage);
  if (!record) return null;
  return record.detail?.toLowerCase() !== "failed";
}

function countProviderRetries(entries: readonly GreenfieldRunLogEntry[]): number {
  return entries.filter(
    (entry) =>
      (entry.stage === "provider_call" ||
        entry.stage === "provider" ||
        entry.stage === "provider_fallback") &&
      /retry/i.test(`${entry.message} ${entry.details ?? ""}`),
  ).length;
}

function countPlannerRetries(entries: readonly GreenfieldRunLogEntry[]): number {
  return entries.filter(
    (entry) =>
      entry.stage === "ai_plan" &&
      /planner.*retry|retry.*planner|reliability retry/i.test(
        `${entry.message} ${entry.details ?? ""}`,
      ),
  ).length;
}

function hasUiAdvisory(
  entries: readonly GreenfieldRunLogEntry[],
  snapshot: ReturnType<typeof greenfieldSnapshotFromArtifact> | null,
): boolean {
  if (snapshot?.uiAuditResult?.advisory) return true;
  return entries.some(
    (entry) =>
      entry.stage === "ui_audit" &&
      entry.status === "success" &&
      /advisory/i.test(entry.message),
  );
}

function snapshotFromArtifactSafe(
  artifact: AgentRunArtifact,
): ReturnType<typeof greenfieldSnapshotFromArtifact> | null {
  try {
    return greenfieldSnapshotFromArtifact(artifact);
  } catch {
    return null;
  }
}

function fallbackUsed(entries: readonly GreenfieldRunLogEntry[]): boolean {
  return entries.some(
    (entry) =>
      entry.stage === "apply_plan" &&
      /deterministic patch proposal|deterministic fallback/i.test(
        `${entry.message} ${entry.details ?? ""}`,
      ),
  );
}

export function computeRunHealth(input: {
  readonly artifact: AgentRunArtifact;
  readonly entries?: readonly GreenfieldRunLogEntry[];
  readonly timeline?: RunTimelineSnapshot | null;
}): RunHealthScore {
  const snapshot = snapshotFromArtifactSafe(input.artifact);
  const entries = input.entries ?? input.artifact.logEntries ?? snapshot?.entries ?? [];
  const timeline = input.timeline ?? input.artifact.timeline ?? snapshot?.runTimeline ?? null;

  const breakdown: { label: string; delta: number }[] = [];
  let score = 0;

  const planningOk =
    stageSucceeded(entries, "ai_plan") ||
    timelineStageOk(timeline, "plan_complete") === true;
  if (planningOk) {
    score += 20;
    breakdown.push({ label: "Planning success", delta: 20 });
  }

  const applyOk =
    stageSucceeded(entries, "apply_plan") ||
    timelineStageOk(timeline, "apply_complete") === true ||
    (input.artifact.outcome === "success" && input.artifact.filesModified.length > 0);
  if (applyOk) {
    score += 20;
    breakdown.push({ label: "Apply success", delta: 20 });
  }

  const tsOk =
    stageSucceeded(entries, "typescript") ||
    timelineStageOk(timeline, "typescript_complete") === true;
  if (tsOk) {
    score += 20;
    breakdown.push({ label: "TypeScript pass", delta: 20 });
  }

  const buildOk =
    stageSucceeded(entries, "build") ||
    timelineStageOk(timeline, "build_complete") === true;
  if (buildOk) {
    score += 20;
    breakdown.push({ label: "Build pass", delta: 20 });
  }

  const previewOk =
    stageSucceeded(entries, "preview") ||
    timelineStageOk(timeline, "preview_complete") === true;
  if (previewOk) {
    score += 10;
    breakdown.push({ label: "Preview pass", delta: 10 });
  }

  const auditStageOk =
    stageSucceeded(entries, "ui_audit") && !stageFailed(entries, "ui_audit");
  if (auditStageOk) {
    score += 10;
    breakdown.push({ label: "UI Audit pass", delta: 10 });
  }

  if (hasUiAdvisory(entries, snapshot)) {
    score -= 5;
    breakdown.push({ label: "UI advisory", delta: -5 });
  }

  const usedFallback = fallbackUsed(entries);
  if (usedFallback) {
    score -= 3;
    breakdown.push({ label: "Fallback used", delta: -3 });
  }

  const plannerRetries = countPlannerRetries(entries);
  if (plannerRetries > 0) {
    score -= 2 * plannerRetries;
    breakdown.push({ label: "Planner retry", delta: -2 * plannerRetries });
  }

  const providerRetries = countProviderRetries(entries);
  if (providerRetries > 0) {
    score -= 2 * providerRetries;
    breakdown.push({ label: "Provider retry", delta: -2 * providerRetries });
  }

  if (isRunFailureOutcome(input.artifact.outcome)) {
    const capped = Math.min(score, 50);
    if (capped < score) {
      breakdown.push({ label: "Failure", delta: capped - score });
    }
    score = capped;
  }

  score = Math.max(0, Math.min(100, score));

  const tone: RunHealthTone =
    score >= 90 ? "green" : score >= 70 ? "yellow" : "red";

  return { score, tone, breakdown };
}

export function formatRunHealthLabel(health: RunHealthScore): string {
  return `Run Health: ${health.score}/100`;
}

export function runHealthClassName(tone: RunHealthTone): string {
  return `run-health run-health--${tone}`;
}
