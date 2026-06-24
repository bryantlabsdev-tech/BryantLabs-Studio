import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { buildAgentTrace } from "@/core/agent/agentTrace";
import { deriveAgentRunState, type DeriveAgentRunStateInput } from "@/core/agent/deriveAgentRunState";
import { extractRunFileDiffs, resolveAllowGeneratedFileDiffs } from "@/core/agent/runFileDiffs";
import { inferOutcomeFromSnapshot } from "@/core/agent/runOutcome";
import {
  applyRequirementOutcome,
  evaluateRequirementChecklist,
} from "@/core/agent/requirementVerification";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";
import { outcomeToOverallStatus } from "@/core/agent/runOutcome";
import { buildDiagnosticReport } from "@/core/diagnostics/diagnosticReport";
import { captureDiagnosticReport } from "@/core/diagnostics/diagnosticReportStore";
import { isFallbackSkeletonAppContent } from "@/core/greenfield/fallbackSkeleton";

export function buildAgentRunArtifact(input: {
  readonly runId: string;
  readonly runNumber: number;
  readonly userMessageId: string | null;
  readonly prompt: string;
  readonly stateInput: DeriveAgentRunStateInput;
  readonly previousRunId?: string | null;
  readonly projectPath?: string | null;
  readonly route?: string | null;
  readonly generationMode?: string | null;
  readonly diagnosticScope?: string | null;
  readonly now?: number;
}): AgentRunArtifact {
  const now = input.now ?? Date.now();
  const state = deriveAgentRunState(input.stateInput, now);
  const terminal = state.terminal;
  const baseOutcome: RunTerminalOutcome =
    terminal.outcome ??
    inferOutcomeFromSnapshot(input.stateInput.greenfieldRun) ??
    "failed";

  const fileDiffs = extractRunFileDiffs({
    card: state.agentRunCard,
    planApplySession: input.stateInput.planApplySession,
    generatedFiles: input.stateInput.greenfieldRun.generatedFiles,
    appliedFileDiffs: input.stateInput.greenfieldRun.appliedFileDiffs,
    allowGeneratedFiles: resolveAllowGeneratedFileDiffs(input.stateInput.greenfieldRun),
  });

  const allowGeneratedEvidence = resolveAllowGeneratedFileDiffs(input.stateInput.greenfieldRun);
  const requirementVerification = evaluateRequirementChecklist({
    prompt: input.prompt,
    fileDiffs,
    ...(allowGeneratedEvidence && input.stateInput.greenfieldRun.generatedFiles
      ? { generatedFiles: input.stateInput.greenfieldRun.generatedFiles }
      : {}),
    ...(input.stateInput.scan ? { scan: input.stateInput.scan } : {}),
    buildPassed:
      baseOutcome === "success" ||
      input.stateInput.greenfieldRun.runResult === "success",
  });
  const outcome =
    baseOutcome === "success" &&
    (() => {
      const appFile = input.stateInput.greenfieldRun.generatedFiles?.find(
        (file) => file.path === "src/App.tsx",
      );
      return appFile ? isFallbackSkeletonAppContent(appFile.content) : false;
    })()
      ? ("incomplete" as RunTerminalOutcome)
      : applyRequirementOutcome(baseOutcome, requirementVerification);

  const agentTrace = buildAgentTrace({
    prompt: input.prompt,
    route: input.route ?? input.stateInput.greenfieldRun.runTimeline?.route ?? null,
    generationMode:
      input.generationMode ?? input.stateInput.greenfieldRun.actionType ?? null,
    greenfieldRun: input.stateInput.greenfieldRun,
    fileDiffs,
    scan: input.stateInput.scan,
    scanStatus: input.stateInput.scan ? "done" : "idle",
    ...(input.stateInput.greenfieldRun.routeDecision
      ? { routeDecision: input.stateInput.greenfieldRun.routeDecision }
      : {}),
    outcome,
  });

  const diagnostic = buildDiagnosticReport({
    runId: input.runId,
    previousRunId: input.previousRunId ?? null,
    prompt: input.prompt,
    outcome,
    route: input.route ?? input.stateInput.greenfieldRun.runTimeline?.route ?? null,
    generationMode:
      input.generationMode ?? input.stateInput.greenfieldRun.actionType ?? null,
    projectPath:
      input.projectPath ??
      input.stateInput.greenfieldRun.projectPath ??
      input.stateInput.greenfieldRun.targetFolder,
    greenfieldRun: input.stateInput.greenfieldRun,
    card: state.agentRunCard,
    timestamp: terminal.endedAtMs ?? now,
  });

  if (input.diagnosticScope) {
    captureDiagnosticReport({
      scope: input.diagnosticScope,
      runNumber: input.runNumber,
      snapshot: diagnostic.snapshot,
      text: diagnostic.text,
    });
  }

  return {
    runId: input.runId,
    runNumber: input.runNumber,
    prompt: input.prompt,
    userMessageId: input.userMessageId,
    startedAt: input.stateInput.greenfieldRun.runStartedAt ?? input.stateInput.runStartedAt ?? now,
    endedAt: terminal.endedAtMs ?? now,
    durationMs: state.agentRunCard.durationMs,
    outcome,
    provider: state.agentRunCard.provider,
    model: state.agentRunCard.model,
    filesModified: [
      ...new Set([
        ...state.agentRunCard.filesModified,
        ...fileDiffs.map((diff) => diff.path),
      ]),
    ],
    fileDiffs,
    logEntries: [...input.stateInput.greenfieldRun.entries],
    debug: input.stateInput.greenfieldRun.debug,
    generationMetrics: input.stateInput.greenfieldRun.generationMetrics,
    generatedFiles: input.stateInput.greenfieldRun.generatedFiles,
    card: {
      ...state.agentRunCard,
      isVisible: true,
      overallStatus: outcomeToOverallStatus(outcome),
    },
    dashboard: {
      ...state.dashboard,
      overallStatus: outcomeToOverallStatus(outcome),
    },
    timeline: input.stateInput.greenfieldRun.runTimeline,
    agentTrace,
    diagnosticReport: diagnostic.snapshot,
    diagnosticText: diagnostic.text,
    previousRunId: input.previousRunId ?? null,
  };
}
