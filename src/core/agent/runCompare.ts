import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import {
  buildRunInspectorViewModel,
  type RunInspectorViewModel,
} from "@/core/agent/runInspector";
import { outcomeLabel } from "@/core/agent/runOutcome";
import { computeRunHealth, type RunHealthScore } from "@/core/agent/runHealth";
import { buildTimelineVisualization } from "@/core/agent/timelineVisualization";
import { estimateRunCostFromArtifact, formatCostDisplay } from "@/core/analytics/runCostEstimate";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

export interface RunCompareSide {
  readonly runId: string;
  readonly runNumber: number;
  readonly outcome: string;
  readonly route: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly durationLabel: string;
  readonly aiCalls: number;
  readonly filesModified: readonly string[];
  readonly commandsRun: readonly string[];
  readonly plannerStatus: "success" | "failure" | "skipped" | "—";
  readonly applyStatus: "success" | "failure" | "skipped" | "—";
  readonly fallbackUsed: boolean;
  readonly auditLayout: string | null;
  readonly auditScore: number | null;
  readonly auditScoreBefore: number | null;
  readonly auditScoreAfter: number | null;
  readonly errorMessage: string | null;
  readonly estimatedCostLabel: string;
  readonly health: RunHealthScore;
  readonly timelineBars: ReturnType<typeof buildTimelineVisualization>;
  readonly learnings: readonly string[];
  readonly inspector: RunInspectorViewModel;
}

export interface RunCompareFileDiffSummary {
  readonly path: string;
  readonly leftAdded: number;
  readonly leftRemoved: number;
  readonly rightAdded: number;
  readonly rightRemoved: number;
  readonly changedInBoth: boolean;
}

export interface RunCompareTimelineDiff {
  readonly label: string;
  readonly leftStatus: string | null;
  readonly rightStatus: string | null;
}

export interface RunCompareViewModel {
  readonly left: RunCompareSide;
  readonly right: RunCompareSide;
  readonly fileDiffSummary: readonly RunCompareFileDiffSummary[];
  readonly timelineDiffs: readonly RunCompareTimelineDiff[];
  readonly healthDelta: number;
  readonly healthImprovementLabel: string;
  readonly learningsOnlyLeft: readonly string[];
  readonly learningsOnlyRight: readonly string[];
  readonly moreSuccessfulRunId: string | null;
  readonly moreSuccessfulLabel: string;
}

function countAiCalls(entries: readonly GreenfieldRunLogEntry[]): number {
  return entries.filter(
    (entry) =>
      entry.stage === "provider_call" ||
      entry.stage === "ai_call" ||
      entry.stage === "provider" ||
      entry.stage === "provider_response",
  ).length;
}

function stageStatus(
  entries: readonly GreenfieldRunLogEntry[],
  stage: GreenfieldRunLogEntry["stage"],
): "success" | "failure" | "skipped" | "—" {
  const related = entries.filter((entry) => entry.stage === stage);
  if (related.length === 0) return "—";
  if (related.some((entry) => entry.status === "success")) return "success";
  if (related.some((entry) => entry.status === "failed")) return "failure";
  return "skipped";
}

function readUiAudit(snapshot: ReturnType<typeof greenfieldSnapshotFromArtifact>): {
  layout: string | null;
  score: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
} {
  const history = snapshot.uiAuditHistory;
  const current = snapshot.uiAuditResult;
  const scoreBefore = history.length > 0 ? history[0]?.score ?? null : null;
  const scoreAfter =
    history.length > 1
      ? history[history.length - 1]?.score ?? null
      : current?.score ?? null;
  return {
    layout: current?.type ?? history.at(-1)?.type ?? null,
    score: current?.score ?? history.at(-1)?.score ?? null,
    scoreBefore,
    scoreAfter: history.length > 1 ? scoreAfter : null,
  };
}

function readErrorMessage(artifact: AgentRunArtifact): string | null {
  if (artifact.outcome === "success") return null;
  return (
    artifact.diagnosticReport?.errorMessage ??
    artifact.card.failureDiagnosis?.reason ??
    artifact.card.summary ??
    null
  );
}

function buildSide(artifact: AgentRunArtifact): RunCompareSide {
  const snapshot = greenfieldSnapshotFromArtifact(artifact);
  const inspector = buildRunInspectorViewModel({
    runId: artifact.runId,
    runNumber: artifact.runNumber,
    prompt: artifact.prompt,
    outcome: artifact.outcome,
    route: artifact.timeline?.route ?? null,
    greenfieldRun: snapshot,
    artifact,
    durationMs: artifact.durationMs,
    provider: artifact.provider,
    model: artifact.model,
    startedAt: artifact.startedAt,
    endedAt: artifact.endedAt,
  });
  const entries = artifact.logEntries ?? snapshot.entries;
  const audit = readUiAudit(snapshot);
  const cost = estimateRunCostFromArtifact(artifact);
  const health = computeRunHealth({ artifact, entries, timeline: artifact.timeline });
  const timelineBars = buildTimelineVisualization(artifact.timeline ?? snapshot.runTimeline);

  return {
    runId: artifact.runId,
    runNumber: artifact.runNumber,
    outcome: outcomeLabel(artifact.outcome),
    route: artifact.timeline?.route ?? null,
    provider: artifact.provider,
    model: artifact.model,
    durationLabel: inspector.metrics.durationLabel,
    aiCalls: countAiCalls(entries),
    filesModified: [...artifact.filesModified],
    commandsRun: [...inspector.metrics.commandsRun],
    plannerStatus: stageStatus(entries, "ai_plan"),
    applyStatus: stageStatus(entries, "apply_plan"),
    fallbackUsed: Boolean(
      inspector.preflight?.fallbackUsed || inspector.apply?.deterministicFallbackUsed,
    ),
    auditLayout: audit.layout,
    auditScore: audit.score,
    auditScoreBefore: audit.scoreBefore,
    auditScoreAfter: audit.scoreAfter,
    errorMessage: readErrorMessage(artifact),
    estimatedCostLabel: formatCostDisplay(cost?.estimatedCostUsd),
    health,
    timelineBars,
    learnings: [],
    inspector,
  };
}

function buildFileDiffSummary(
  left: RunCompareSide,
  right: RunCompareSide,
): RunCompareFileDiffSummary[] {
  const paths = new Set<string>([
    ...left.inspector.fileDiffs.map((diff) => diff.path),
    ...right.inspector.fileDiffs.map((diff) => diff.path),
    ...left.filesModified,
    ...right.filesModified,
  ]);
  return [...paths].map((path) => {
    const leftDiff = left.inspector.fileDiffs.find((diff) => diff.path === path);
    const rightDiff = right.inspector.fileDiffs.find((diff) => diff.path === path);
    return {
      path,
      leftAdded: leftDiff?.linesAdded ?? 0,
      leftRemoved: leftDiff?.linesRemoved ?? 0,
      rightAdded: rightDiff?.linesAdded ?? 0,
      rightRemoved: rightDiff?.linesRemoved ?? 0,
      changedInBoth: Boolean(leftDiff && rightDiff),
    };
  });
}

function buildTimelineDiffs(
  left: RunCompareSide,
  right: RunCompareSide,
): RunCompareTimelineDiff[] {
  const labels = new Set<string>([
    ...left.inspector.timeline.map((item) => item.label),
    ...right.inspector.timeline.map((item) => item.label),
  ]);
  return [...labels].map((label) => ({
    label,
    leftStatus: left.inspector.timeline.find((item) => item.label === label)?.status ?? null,
    rightStatus: right.inspector.timeline.find((item) => item.label === label)?.status ?? null,
  }));
}

function scoreRun(side: RunCompareSide): number {
  let score = side.health.score;
  if (side.outcome === "Complete") score += 1_000;
  else if (side.outcome === "Failed") score -= 1_000;
  return score;
}

function buildHealthImprovementLabel(
  left: RunCompareSide,
  right: RunCompareSide,
  delta: number,
): string {
  if (delta === 0) return "Health unchanged";
  const better = delta > 0 ? right : left;
  const worse = delta > 0 ? left : right;
  const parts = [`+${Math.abs(delta)}`];
  if (worse.auditScore != null && better.auditScore != null && better.auditScore > worse.auditScore) {
    parts.push("Audit fixed");
  } else if (!worse.fallbackUsed && better.fallbackUsed) {
    parts.push("Fallback used");
  } else if (worse.plannerStatus !== "success" && better.plannerStatus === "success") {
    parts.push("Planning improved");
  } else if (worse.applyStatus !== "success" && better.applyStatus === "success") {
    parts.push("Apply improved");
  }
  return parts.join(" · ");
}

export function buildRunCompareViewModel(
  leftArtifact: AgentRunArtifact,
  rightArtifact: AgentRunArtifact,
  options?: {
    readonly leftLearnings?: readonly string[];
    readonly rightLearnings?: readonly string[];
  },
): RunCompareViewModel {
  const left = buildSide(leftArtifact);
  const right = buildSide(rightArtifact);
  const leftLearnings = options?.leftLearnings ?? [];
  const rightLearnings = options?.rightLearnings ?? [];
  const leftWithLearnings = { ...left, learnings: leftLearnings };
  const rightWithLearnings = { ...right, learnings: rightLearnings };
  const leftScore = scoreRun(leftWithLearnings);
  const rightScore = scoreRun(rightWithLearnings);
  const healthDelta = rightScore - leftScore;

  let moreSuccessfulRunId: string | null = null;
  let moreSuccessfulLabel = "Both runs are similarly successful";
  if (leftScore > rightScore) {
    moreSuccessfulRunId = left.runId;
    moreSuccessfulLabel = `Run #${left.runNumber} was more successful`;
  } else if (rightScore > leftScore) {
    moreSuccessfulRunId = right.runId;
    moreSuccessfulLabel = `Run #${right.runNumber} was more successful`;
  }

  const learningsOnlyLeft = leftLearnings.filter((item) => !rightLearnings.includes(item));
  const learningsOnlyRight = rightLearnings.filter((item) => !leftLearnings.includes(item));

  return {
    left: leftWithLearnings,
    right: rightWithLearnings,
    fileDiffSummary: buildFileDiffSummary(left, right),
    timelineDiffs: buildTimelineDiffs(left, right),
    healthDelta,
    healthImprovementLabel: buildHealthImprovementLabel(left, right, healthDelta),
    learningsOnlyLeft,
    learningsOnlyRight,
    moreSuccessfulRunId,
    moreSuccessfulLabel,
  };
}

export function toggleCompareRunSelection(
  selected: readonly string[],
  runId: string,
): string[] {
  if (selected.includes(runId)) {
    return selected.filter((id) => id !== runId);
  }
  if (selected.length >= 2) {
    return [selected[1]!, runId];
  }
  return [...selected, runId];
}
