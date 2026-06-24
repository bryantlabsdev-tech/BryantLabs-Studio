import type { BuildLoopPhase } from "./types";
import type { GreenfieldRunLogEntry, RunLogStage } from "@/core/greenfield/runLog";
import type { PlanApplyPhase } from "@/core/planApply/types";
import {
  buildSuggestedFallbacks,
  classifyReliabilityFromError,
} from "@/core/providers/reliability";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";

/** User-facing follow-up steps (no internal pipeline jargon). */
export type FollowUpDisplayPhase =
  | "idle"
  | "thinking"
  | "editing"
  | "reviewing"
  | "testing"
  | "previewing"
  | "done"
  | "failed";

export const FOLLOWUP_TIMELINE_STEPS: readonly FollowUpDisplayPhase[] = [
  "thinking",
  "editing",
  "reviewing",
  "testing",
  "previewing",
  "done",
] as const;

export const FOLLOWUP_PHASE_LABELS: Record<FollowUpDisplayPhase, string> = {
  idle: "Ready",
  thinking: "Thinking",
  editing: "Editing",
  reviewing: "Reviewing",
  testing: "Testing",
  previewing: "Previewing",
  done: "Done",
  failed: "Something went wrong",
};

export function resolveFollowUpDisplayPhase(input: {
  buildPhase: BuildLoopPhase;
  planApplyPhase: PlanApplyPhase | null;
  recentLogs: readonly GreenfieldRunLogEntry[];
}): FollowUpDisplayPhase {
  const { buildPhase, planApplyPhase, recentLogs } = input;

  if (buildPhase === "failed") return "failed";
  if (buildPhase === "completed" || planApplyPhase === "done") return "done";

  if (isPreviewRunning(recentLogs)) return "previewing";

  switch (buildPhase) {
    case "planning":
      return "thinking";
    case "coding":
    case "applying":
      return "editing";
    case "review":
      return "reviewing";
    case "verifying":
    case "repairing":
      return isPreviewRunning(recentLogs) ? "previewing" : "testing";
    case "idle":
      return planApplyPhase === "review" ? "reviewing" : "idle";
    default:
      return "idle";
  }
}

function isPreviewRunning(recentLogs: readonly GreenfieldRunLogEntry[]): boolean {
  return [...recentLogs]
    .reverse()
    .some((e) => e.status === "running" && e.stage === "preview");
}

export function followUpStepIndex(phase: FollowUpDisplayPhase): number {
  if (phase === "idle" || phase === "failed") return -1;
  const idx = FOLLOWUP_TIMELINE_STEPS.indexOf(phase);
  return idx >= 0 ? idx : -1;
}

const LOG_STAGE_MESSAGES: Partial<Record<RunLogStage, string>> = {
  ai_plan: "Analyzing your project…",
  pipeline_planner: "Analyzing your project…",
  apply_plan: "Generating changes…",
  pipeline_coder: "Generating changes…",
  multi_file_execution: "Applying changes across files…",
  review: "Preparing your review…",
  write: "Saving changes…",
  typescript: "Running TypeScript checks…",
  build: "Running build…",
  verification: "Verifying the project…",
  preview: "Starting preview…",
  auto_fix: "Fixing issues automatically…",
  pipeline_repair: "Fixing issues automatically…",
  pipeline: "Working on your request…",
  pipeline_complete: "Finished",
  error: "Encountered a problem",
};

export function formatFollowUpLogMessage(entry: GreenfieldRunLogEntry): string {
  const mapped = LOG_STAGE_MESSAGES[entry.stage];
  const raw = scrubInternalTerms(entry.message.trim());
  if (mapped && (raw.length === 0 || looksInternal(entry.message) || looksInternal(raw))) {
    return mapped;
  }
  if (raw.length > 0 && !looksInternal(raw)) {
    return raw;
  }
  if (mapped) return mapped;
  if (entry.status === "success") return "Step completed";
  if (entry.status === "failed") return "Step failed";
  return "Working…";
}

function looksInternal(text: string): boolean {
  return (
    /@@FILE/i.test(text) ||
    /\bapply_plan\b/i.test(text) ||
    /\bpipeline_coder\b/i.test(text) ||
    /\bprovider_call\b/i.test(text) ||
    /\bmulti_file_execution\b/i.test(text) ||
    /\[apply_plan\]/i.test(text) ||
    /proposing patches/i.test(text) ||
    /patch proposal/i.test(text)
  );
}

function scrubInternalTerms(text: string): string {
  return text
    .replace(/\[apply_plan\]\s*/gi, "")
    .replace(/\[pipeline[^\]]*\]\s*/gi, "")
    .replace(/\[build\]\s*/gi, "")
    .replace(/\bapply_plan\b/gi, "changes")
    .replace(/\bpipeline_coder\b/gi, "editor")
    .replace(/\bprovider_call\b/gi, "AI request")
    .replace(/\bmulti_file_execution\b/gi, "file updates")
    .trim();
}

export function formatUserFacingBuildError(
  error: string,
  context?: { provider?: ProviderId; model?: string },
): string {
  const msg = error.trim();
  if (!msg) return "Something went wrong. Try again or switch provider.";

  if (/zero valid patch proposals/i.test(msg)) {
    const provider = context?.provider
      ? PROVIDER_DISPLAY_LABELS[context.provider]
      : "The AI provider";
    return `I could not generate valid changes. ${provider} may have timed out or returned an unusable response. Try another provider or reduce the request.`;
  }

  if (/provider budget exceeded|max ai calls|budget exceeded/i.test(msg)) {
    return "The AI call limit was reached. Increase Max AI calls in Settings or retry with a smaller request.";
  }

  if (/timed out|timeout/i.test(msg)) {
    return "The request timed out. Try a smaller change or switch to a faster provider.";
  }

  if (/rate limit|429/i.test(msg)) {
    return "The provider is rate limited. Wait a moment, retry, or switch provider.";
  }

  if (/invalid key|401|403|unauthorized/i.test(msg)) {
    return "The API key looks invalid. Check Provider settings and try again.";
  }

  if (/no credits|402|insufficient credits/i.test(msg)) {
    return "The provider account has no credits. Add credits or switch provider.";
  }

  if (/AI plan failed/i.test(msg)) {
    return "I could not plan the changes. Check your provider connection or try a simpler request.";
  }

  if (/Could not create a plan/i.test(msg)) {
    return "I could not figure out which files to change. Try describing the change more specifically.";
  }

  if (/Previous app generation failed before build completed/i.test(msg)) {
    return "App setup did not finish. Resubmit your original creation prompt to retry setup — editing is blocked until setup succeeds.";
  }

  if (/Apply failed/i.test(msg)) {
    return "The changes could not be saved. Check verification logs or try again.";
  }

  const status = classifyReliabilityFromError(msg);
  if (status === "timeout") {
    return "The request timed out. Try a smaller change or switch provider.";
  }
  if (status === "rate_limited") {
    return "The provider is rate limited. Wait, retry, or switch provider.";
  }
  if (status === "invalid_key") {
    return "The API key looks invalid. Check Provider settings.";
  }

  return scrubInternalTerms(msg) || "Something went wrong. Try again.";
}

export type FollowUpRecoveryAction =
  | { kind: "retry" }
  | { kind: "switch_provider"; provider: ProviderId; label: string }
  | { kind: "open_providers" }
  | { kind: "cheaper_model" };

export function suggestFollowUpRecoveryActions(
  error: string,
  settings: ProviderSettings,
  failedProvider?: ProviderId,
): FollowUpRecoveryAction[] {
  const actions: FollowUpRecoveryAction[] = [{ kind: "retry" }];
  const provider = failedProvider ?? settings.provider;

  const fallbacks = buildSuggestedFallbacks(provider, settings);
  for (const fb of fallbacks.slice(0, 2)) {
    const label =
      fb === "anthropic"
        ? "Retry with Claude"
        : fb === "groq"
          ? "Retry with Groq"
          : `Retry with ${PROVIDER_DISPLAY_LABELS[fb]}`;
    actions.push({ kind: "switch_provider", provider: fb, label });
  }

  if (/budget|max ai calls/i.test(error)) {
    actions.push({ kind: "open_providers" });
  }

  if (
    provider !== "groq" &&
    provider !== "gemini" &&
    settings.hasGroqKey
  ) {
    actions.push({ kind: "cheaper_model" });
  } else if (provider !== "gemini" && settings.hasGeminiKey) {
    actions.push({ kind: "cheaper_model" });
  }

  return actions;
}

export function buildPhaseLabel(phase: FollowUpDisplayPhase): string {
  return FOLLOWUP_PHASE_LABELS[phase];
}
