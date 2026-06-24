import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import { buildRunInspectorViewModel } from "@/core/agent/runInspector";
import type { AgentLearning } from "@/core/projectIntelligence/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

function countRetries(
  entries: readonly GreenfieldRunLogEntry[],
  pattern: RegExp,
): number {
  return entries.filter((entry) =>
    pattern.test(`${entry.message} ${entry.details ?? ""}`),
  ).length;
}

function humanizeIssue(issue: string): string {
  return issue.replace(/_/g, " ");
}

export function generateAgentLearnings(artifact: AgentRunArtifact): AgentLearning[] {
  const snapshot = greenfieldSnapshotFromArtifact(artifact);
  const entries = artifact.logEntries ?? snapshot.entries;
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

  const learnings: AgentLearning[] = [];
  const at = artifact.endedAt || Date.now();
  const base = {
    runId: artifact.runId,
    runNumber: artifact.runNumber,
    at,
  };

  const auditIssues = snapshot.uiAuditResult?.issues ?? [];
  if (artifact.outcome === "success" && auditIssues.length > 0) {
    for (const issue of auditIssues) {
      learnings.push({
        id: `${artifact.runId}-audit-${issue}`,
        text: `${humanizeIssue(issue)} was addressed in this run.`,
        ...base,
      });
    }
  }

  if (inspector.apply?.deterministicFallbackUsed) {
    learnings.push({
      id: `${artifact.runId}-fallback`,
      text: "Fallback patch succeeded when coder stage failed.",
      ...base,
    });
  }

  const providerRetries = countRetries(entries, /provider.*retry|retry.*provider/i);
  if (providerRetries > 0) {
    const modelLabel = artifact.model ?? "provider";
    learnings.push({
      id: `${artifact.runId}-provider-retry`,
      text: `${modelLabel} required ${providerRetries} retr${providerRetries === 1 ? "y" : "ies"} before success.`,
      ...base,
    });
  }

  const plannerRetries = countRetries(entries, /planner.*retry|retry.*planner|reliability/i);
  if (plannerRetries > 0) {
    learnings.push({
      id: `${artifact.runId}-planner-retry`,
      text: `Planner required ${plannerRetries} retr${plannerRetries === 1 ? "y" : "ies"} before success.`,
      ...base,
    });
  }

  if (
    artifact.outcome === "success" &&
    artifact.filesModified.some((path) => /table|overflow|scroll/i.test(path))
  ) {
    learnings.push({
      id: `${artifact.runId}-responsive-table`,
      text: "Responsive tables resolved rows_overflow.",
      ...base,
    });
  }

  if (artifact.outcome === "failed") {
    const reason =
      artifact.diagnosticReport?.errorMessage ??
      artifact.card.failureDiagnosis?.reason ??
      artifact.card.summary;
    if (reason) {
      learnings.push({
        id: `${artifact.runId}-failure`,
        text: `Run failed: ${reason.slice(0, 160)}`,
        ...base,
      });
    }
  }

  return learnings;
}
