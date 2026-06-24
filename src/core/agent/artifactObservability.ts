import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { createRunLogEntry, type GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { StudioActionType } from "@/core/studioRun/types";
import {
  isRunFailureOutcome,
  isRunNeutralOutcome,
  runResultFromOutcome,
} from "@/core/agent/runOutcome";

function inferActionType(artifact: AgentRunArtifact): StudioActionType {
  if (artifact.card.title?.toLowerCase().includes("creating app")) return "greenfield";
  if (artifact.card.steps?.some((step) => step.id === "applying")) return "apply_plan";
  return "studio_agent";
}

function syntheticLogEntries(artifact: AgentRunArtifact): GreenfieldRunLogEntry[] {
  const entries: GreenfieldRunLogEntry[] = [];
  for (const step of artifact.card.steps ?? []) {
    if (step.status === "pending") continue;
    const stage =
      step.id === "building"
        ? "build"
        : step.id === "typescript"
          ? "typescript"
          : step.id === "preview"
            ? "preview"
            : step.id === "editing" || step.id === "applying"
              ? "apply_plan"
              : step.id === "planning"
                ? "ai_plan"
                : "studio_agent";
    const status: GreenfieldRunLogEntry["status"] =
      step.status === "failed"
        ? "failed"
        : step.status === "running" || step.status === "retrying"
          ? "running"
          : "success";
    entries.push(createRunLogEntry(stage, status, step.label));
  }
  for (const thought of artifact.card.thoughtStream ?? []) {
    entries.push(createRunLogEntry("studio_agent", "running", thought.text));
  }
  if (artifact.card.summary) {
    entries.push(
      createRunLogEntry(
        "pipeline_complete",
        artifact.outcome === "success" ? "success" : "failed",
        artifact.card.summary,
      ),
    );
  }
  return entries;
}

export function greenfieldSnapshotFromArtifact(artifact: AgentRunArtifact): GreenfieldRunSnapshot {
  const base = emptyGreenfieldRun();
  const storedEntries = artifact.logEntries ?? [];
  const entries = storedEntries.length > 0 ? storedEntries : syntheticLogEntries(artifact);

  return {
    ...base,
    actionType: inferActionType(artifact),
    projectPath: null,
    workflow: {
      prompt: artifact.prompt,
      ...(() => {
        const planSummary =
          artifact.card.successSummary?.summaryLine?.trim() ||
          artifact.card.summary?.trim() ||
          "";
        return planSummary ? { planSummary } : {};
      })(),
      filesProposed: artifact.filesModified.length,
      filesAccepted: artifact.filesModified.length,
      filesWritten: [...artifact.filesModified],
      linesAdded: artifact.fileDiffs.reduce((sum, file) => sum + file.linesAdded, 0),
      linesRemoved: artifact.fileDiffs.reduce((sum, file) => sum + file.linesRemoved, 0),
      verificationOk: artifact.outcome === "success",
      errors:
        isRunFailureOutcome(artifact.outcome)
          ? [artifact.card.failureDiagnosis?.reason ?? "Run failed"]
          : [],
    },
    entries: [...entries],
    debug: artifact.debug ?? null,
    generationMetrics: artifact.generationMetrics ?? null,
    generatedFiles: artifact.generatedFiles ? [...artifact.generatedFiles] : null,
    runStartedAt: artifact.startedAt,
    endedAt: artifact.endedAt,
    durationMs: artifact.durationMs,
    filesWritten: [...artifact.filesModified],
    appliedFileDiffs: [...artifact.fileDiffs],
    provider: artifact.provider,
    model: artifact.model,
    runResult: runResultFromOutcome(artifact.outcome),
    runTimeline: artifact.timeline,
    finalMessage: artifact.card.summary,
    previousSuccessfulRunMessage:
      artifact.outcome === "success" ? (artifact.card.successSummary?.summaryLine ?? null) : null,
    genStatus:
      artifact.outcome === "success"
        ? "success"
        : isRunNeutralOutcome(artifact.outcome)
          ? "error"
          : "failed",
    writeStatus: artifact.filesModified.length > 0 ? "success" : "idle",
    setupStatus: artifact.card.verification?.build === "passed" ? "success" : "idle",
  };
}

export function isViewingHistoricalRun(
  selectedRunId: string | null,
  artifact: AgentRunArtifact | null,
): artifact is AgentRunArtifact {
  return Boolean(selectedRunId && artifact);
}
