import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { RunFailureDetailsViewModel } from "@/core/agent/runFailureDiagnostics";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";

export interface RunConversationViewModel {
  readonly headline: string;
  readonly narrativeLines: readonly string[];
  readonly modifiedFiles: readonly string[];
  readonly isSuccess: boolean;
  readonly isFailed: boolean;
  readonly isCancelled: boolean;
  readonly isNeutral: boolean;
  readonly isRunning: boolean;
  readonly previewReady: boolean;
  readonly durationMs: number;
  readonly filesCount: number;
  readonly failureTitle: string | null;
  readonly failureReason: string | null;
  readonly failureFile: string | null;
  readonly suggestedFix: string | null;
  readonly failureDetails: RunFailureDetailsViewModel | null;
}

function uniqueFiles(card: AgentRunCardViewModel): string[] {
  const paths = new Set<string>();
  for (const file of card.fileActivity) paths.add(file.path);
  for (const file of card.patchImpact.files) paths.add(file.path);
  for (const file of card.filesModified) paths.add(file);
  return [...paths];
}

function inferHeadline(card: AgentRunCardViewModel): string {
  const createdFromScratch =
    card.title.toLowerCase().includes("creating app") ||
    (card.filesWritten.length >= 5 &&
      card.steps.some((step) => step.id === "planning" && step.status === "success"));
  if (createdFromScratch) return "Created app";
  if (card.filesModified.length > 0 || card.fileActivity.some((f) => f.status === "written")) {
    return "Modified files";
  }
  if (card.reasoning.headline.trim()) return card.reasoning.headline.trim();
  return card.title;
}

function buildNarrativeLines(card: AgentRunCardViewModel): string[] {
  const lines: string[] = [];
  const headline = inferHeadline(card);
  lines.push(headline);

  const files = uniqueFiles(card);
  if (files.length > 0 && headline !== "Modified files") {
    lines.push("Modified:");
  }

  if (card.verification.build === "passed") lines.push("Build passed");
  if (card.verification.preview === "ready") lines.push("Preview ready");
  if (card.verification.typescript === "passed" && card.verification.build !== "passed") {
    lines.push("TypeScript passed");
  }

  return lines;
}

export function deriveRunConversation(input: {
  readonly card: AgentRunCardViewModel;
  readonly outcome?: RunTerminalOutcome | null;
}): RunConversationViewModel {
  const { card } = input;
  const outcome = input.outcome ?? null;
  const isRunning = card.overallStatus === "running";
  const isCancelled =
    outcome === "cancelled" || card.overallStatus === "cancelled";
  const isAborted =
    outcome === "aborted" || card.overallStatus === "aborted";
  const isInterrupted =
    outcome === "interrupted" || card.overallStatus === "interrupted";
  const isNeutral = isCancelled || isAborted || isInterrupted;
  const isFailed =
    !isNeutral &&
    (outcome === "failed" || card.overallStatus === "failed");
  const isSuccess =
    !isRunning &&
    !isFailed &&
    !isNeutral &&
    (outcome === "success" ||
      card.overallStatus === "complete" ||
      card.verification.build === "passed");

  const modifiedFiles = uniqueFiles(card);
  const diagnosis = card.failureDiagnosis;
  const diagnostic = card.diagnostics.items[0] ?? null;
  const failureDetails = card.failureDetails;

  return {
    headline: inferHeadline(card),
    narrativeLines: buildNarrativeLines(card),
    modifiedFiles,
    isSuccess,
    isFailed,
    isCancelled,
    isNeutral,
    isRunning,
    previewReady: card.verification.preview === "ready",
    durationMs: card.durationMs,
    filesCount: modifiedFiles.length,
    failureTitle:
      failureDetails?.headline ?? diagnosis?.title ?? diagnostic?.title ?? null,
    failureReason:
      failureDetails?.rawErrorMessage ??
      diagnosis?.reason ??
      diagnostic?.reason ??
      null,
    failureFile: diagnosis?.errorLocation ?? diagnostic?.errorLocation ?? null,
    suggestedFix:
      failureDetails?.whatToTryNext[0] ??
      diagnosis?.suggestedFix ??
      diagnostic?.suggestedFix ??
      null,
    failureDetails,
  };
}
