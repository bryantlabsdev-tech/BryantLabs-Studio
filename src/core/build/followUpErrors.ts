import { isIncompleteGreenfieldBlockMessage } from "@/core/agent/greenfieldRecoveryRouting";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import { classifyReliabilityFromError } from "@/core/providers/reliability";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import { buildSuggestedFallbacks } from "@/core/providers/reliability";
import {
  shouldOfferStrongerModel,
  suggestStrongerModelStep,
  type StrongerModelStep,
} from "@/core/build/modelEscalation";

function scrubInternalTerms(text: string): string {
  return text
    .replace(/\[apply_plan\]\s*/gi, "")
    .replace(/\[pipeline[^\]]*\]\s*/gi, "")
    .replace(/\bapply_plan\b/gi, "changes")
    .replace(/\bpipeline_coder\b/gi, "editor")
    .trim();
}

export interface FollowUpErrorSurface {
  readonly headline: string;
  readonly rawDetail: string | null;
  readonly diagnosticsText: string;
}

export function collectFollowUpError(input: {
  buildError: string | null;
  planApplyError: string | null;
  pipelineError: string | null;
  failureReport: StudioFailureReport | null;
  greenfieldFinalMessage?: string | null;
  provider?: ProviderId;
  model?: string;
}): FollowUpErrorSurface | null {
  const raw =
    input.buildError ??
    input.planApplyError ??
    input.pipelineError ??
    input.failureReport?.rootCauseLine ??
    input.greenfieldFinalMessage ??
    null;
  if (!raw?.trim()) return null;

  const headline = formatFollowUpErrorHeadline(raw, {
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
    failureReport: input.failureReport,
  });

  const diagnosticsParts = [
    headline,
    input.failureReport?.rootCauseLine,
    input.buildError,
    input.planApplyError,
    input.pipelineError,
  ].filter(Boolean) as string[];

  return {
    headline,
    rawDetail: raw,
    diagnosticsText: diagnosticsParts.join("\n\n"),
  };
}

export function formatFollowUpErrorHeadline(
  error: string,
  context?: {
    provider?: ProviderId;
    model?: string;
    failureReport?: StudioFailureReport | null;
  },
): string {
  const msg = error.trim();
  const providerName = context?.provider
    ? PROVIDER_DISPLAY_LABELS[context.provider]
    : "The AI provider";
  const modelSuffix = context?.model ? ` (${context.model})` : "";

  if (/zero valid patch proposals/i.test(msg)) {
    return `No valid patch proposal was generated. ${providerName}${modelSuffix} may have timed out or returned an unusable response.`;
  }

  if (/provider budget exceeded|max ai calls|budget exceeded/i.test(msg)) {
    return "Provider limit reached. Increase Max AI calls in Settings or try a smaller request.";
  }

  if (/timed out|timeout/i.test(msg)) {
    return `${providerName} timed out while generating changes.`;
  }

  if (/rate limit|429|high demand|resource exhausted/i.test(msg)) {
    return `${providerName} is under high demand. Wait a moment or switch provider.`;
  }

  if (/typescript|tsc|TS\d{4}/i.test(msg) || context?.failureReport?.rootStage === "typescript") {
    const file = extractTsFile(msg) ?? extractTsFile(context?.failureReport?.rootCauseLine ?? "");
    return file
      ? `TypeScript failed in ${file}.`
      : "TypeScript verification failed.";
  }

  if (/build failed|vite build/i.test(msg) || context?.failureReport?.rootStage === "build") {
    return "Build failed after applying changes.";
  }

  if (/npm install failed/i.test(msg) || context?.failureReport?.rootStage === "npm_install") {
    return "npm install failed. Check your network connection and try again.";
  }

  if (/preview/i.test(msg)) {
    return "Preview could not start.";
  }

  if (/invalid key|401|403|unauthorized/i.test(msg)) {
    return "The API key looks invalid. Check Provider settings.";
  }

  if (/AI plan failed/i.test(msg)) {
    return "Could not plan the changes. Check your provider connection.";
  }

  if (/Could not create a plan/i.test(msg)) {
    return "Could not figure out which files to change. Try being more specific.";
  }

  if (/Previous app generation failed before build completed/i.test(msg)) {
    return "App setup did not finish. Resubmit your original creation prompt to retry setup recovery.";
  }

  if (/Apply failed/i.test(msg)) {
    return "The changes could not be saved.";
  }

  const status = classifyReliabilityFromError(msg);
  if (status === "timeout") {
    return `${providerName} timed out while generating changes.`;
  }
  if (status === "rate_limited") {
    return `${providerName} is rate limited.`;
  }

  return scrubInternalTerms(msg) || "Something went wrong. Try again.";
}

function extractTsFile(text: string): string | null {
  const m = text.match(/\b((?:src\/)[A-Za-z0-9_./-]+\.(?:tsx?|jsx?))\b/);
  return m?.[1] ?? null;
}

export type FollowUpRecoveryActionV2 =
  | { kind: "retry" }
  | { kind: "greenfield_recovery"; prompt: string }
  | { kind: "stronger_model"; step: StrongerModelStep }
  | { kind: "switch_provider"; provider: ProviderId; label: string }
  | { kind: "open_providers" }
  | { kind: "copy_diagnostics" }
  | { kind: "view_details" }
  | { kind: "inspect_run" }
  | { kind: "open_diagnostic_report" };

export function suggestFollowUpRecoveryV2(
  error: string,
  settings: ProviderSettings,
  failedProvider?: ProviderId,
  opts?: { readonly originalGreenfieldPrompt?: string | null },
): FollowUpRecoveryActionV2[] {
  if (isIncompleteGreenfieldBlockMessage(error)) {
    const original = opts?.originalGreenfieldPrompt?.trim();
    const actions: FollowUpRecoveryActionV2[] = [];
    if (original && original.length >= 4) {
      actions.push({ kind: "greenfield_recovery", prompt: original });
    }
    actions.push({ kind: "view_details" });
    return actions;
  }

  const actions: FollowUpRecoveryActionV2[] = [{ kind: "retry" }];
  const provider = failedProvider ?? settings.provider;

  if (shouldOfferStrongerModel(error)) {
    const stronger = suggestStrongerModelStep(provider, modelForFailed(settings, provider), settings);
    if (stronger) {
      actions.push({
        kind: "stronger_model",
        step: { ...stronger, label: "Use stronger model for this change" },
      });
    }
  }

  const fallbacks = buildSuggestedFallbacks(provider, settings);
  for (const fb of fallbacks.slice(0, 2)) {
    actions.push({
      kind: "switch_provider",
      provider: fb,
      label: `Switch to ${PROVIDER_DISPLAY_LABELS[fb]}`,
    });
  }

  if (/budget|max ai calls/i.test(error)) {
    actions.push({ kind: "open_providers" });
  }

  actions.push({ kind: "copy_diagnostics" });
  actions.push({ kind: "open_diagnostic_report" });
  actions.push({ kind: "inspect_run" });
  actions.push({ kind: "view_details" });

  return actions;
}

function modelForFailed(settings: ProviderSettings, provider: ProviderId): string {
  switch (provider) {
    case "gemini":
      return settings.geminiModel;
    case "anthropic":
      return settings.anthropicModel;
    case "groq":
      return settings.groqModel;
    case "openrouter":
      return settings.openrouterModel;
    case "ollama":
      return settings.ollamaModel;
    default:
      return "";
  }
}
