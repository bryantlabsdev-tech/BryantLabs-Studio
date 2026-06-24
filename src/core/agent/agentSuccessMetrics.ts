import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import { buildRunInspectorViewModel } from "@/core/agent/runInspector";
import { isRunFailureOutcome } from "@/core/agent/runOutcome";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

export interface AgentSuccessMetrics {
  readonly totalRuns: number;
  readonly successRate: number;
  readonly failureRate: number;
  readonly plannerSuccessRate: number | null;
  readonly applySuccessRate: number | null;
  readonly verificationSuccessRate: number | null;
  readonly fallbackSaves: number;
  readonly averageDurationMs: number | null;
  readonly averageAiCalls: number | null;
  readonly filesModifiedTotal: number;
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

function stageAttempted(
  entries: readonly GreenfieldRunLogEntry[],
  stage: GreenfieldRunLogEntry["stage"],
): boolean {
  return entries.some((entry) => entry.stage === stage);
}

function stageSucceeded(
  entries: readonly GreenfieldRunLogEntry[],
  stage: GreenfieldRunLogEntry["stage"],
): boolean {
  return entries.some((entry) => entry.stage === stage && entry.status === "success");
}

function usedFallback(artifact: AgentRunArtifact): boolean {
  const snapshot = greenfieldSnapshotFromArtifact(artifact);
  const model = buildRunInspectorViewModel({
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
  return Boolean(
    model.preflight?.fallbackUsed || model.apply?.deterministicFallbackUsed,
  );
}

export function computeAgentSuccessMetrics(
  artifacts: readonly AgentRunArtifact[],
): AgentSuccessMetrics {
  const totalRuns = artifacts.length;
  const successes = artifacts.filter((artifact) => artifact.outcome === "success").length;
  const failures = artifacts.filter((artifact) => isRunFailureOutcome(artifact.outcome)).length;
  const measured = successes + failures;

  let plannerAttempts = 0;
  let plannerSuccesses = 0;
  let applyAttempts = 0;
  let applySuccesses = 0;
  let verificationAttempts = 0;
  let verificationSuccesses = 0;
  let fallbackSaves = 0;
  let durationTotal = 0;
  let durationCount = 0;
  let aiCallsTotal = 0;
  let aiCallsCount = 0;
  let filesModifiedTotal = 0;

  for (const artifact of artifacts) {
    const entries = artifact.logEntries ?? [];
    if (stageAttempted(entries, "ai_plan")) {
      plannerAttempts += 1;
      if (stageSucceeded(entries, "ai_plan")) plannerSuccesses += 1;
    }
    if (stageAttempted(entries, "apply_plan")) {
      applyAttempts += 1;
      if (
        stageSucceeded(entries, "apply_plan") ||
        (artifact.outcome === "success" && artifact.filesModified.length > 0)
      ) {
        applySuccesses += 1;
      }
    }
    if (stageAttempted(entries, "verification") || stageAttempted(entries, "typescript")) {
      verificationAttempts += 1;
      if (
        stageSucceeded(entries, "verification") ||
        stageSucceeded(entries, "typescript")
      ) {
        verificationSuccesses += 1;
      }
    }
    if (usedFallback(artifact)) fallbackSaves += 1;
    if (artifact.durationMs >= 0) {
      durationTotal += artifact.durationMs;
      durationCount += 1;
    }
    const aiCalls = countAiCalls(entries);
    if (aiCalls > 0) {
      aiCallsTotal += aiCalls;
      aiCallsCount += 1;
    }
    filesModifiedTotal += artifact.filesModified.length;
  }

  return {
    totalRuns,
    successRate: measured > 0 ? (successes / measured) * 100 : 0,
    failureRate: measured > 0 ? (failures / measured) * 100 : 0,
    plannerSuccessRate:
      plannerAttempts > 0 ? (plannerSuccesses / plannerAttempts) * 100 : null,
    applySuccessRate: applyAttempts > 0 ? (applySuccesses / applyAttempts) * 100 : null,
    verificationSuccessRate:
      verificationAttempts > 0
        ? (verificationSuccesses / verificationAttempts) * 100
        : null,
    fallbackSaves,
    averageDurationMs:
      durationCount > 0 ? Math.round(durationTotal / durationCount) : null,
    averageAiCalls:
      aiCallsCount > 0 ? Math.round((aiCallsTotal / aiCallsCount) * 10) / 10 : null,
    filesModifiedTotal,
  };
}
