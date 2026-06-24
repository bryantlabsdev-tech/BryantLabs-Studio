import type { BryantLabsApi } from "@/types";
import {
  buildProviderFailure,
  healthToReliabilityStatus,
  reliabilityUserMessage,
  type ProviderFailure,
} from "@/core/providers/reliability";
import {
  logProviderError,
  logProviderSelected,
  providerApiKeyPresent,
  truncateResponseBody,
} from "@/core/providers/providerDiagnostics";
import {
  resolveStageRouting,
  type AgentStage,
} from "@/core/providers/orchestration";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";
import { isRendererE2eMockMode } from "@/core/providers/e2eMockMode";

export type ProviderConnectionGateResult =
  | { ok: true; provider: ProviderId; model: string }
  | { ok: false; failure: ProviderFailure; message: string };

export async function verifyStageProviderConnection(
  api: BryantLabsApi,
  settings: ProviderSettings,
  stage: AgentStage,
): Promise<ProviderConnectionGateResult> {
  const routing = resolveStageRouting(settings, stage);
  if (!routing || routing.stage === "verifier") {
    return {
      ok: false,
      failure: buildProviderFailure({
        provider: settings.provider,
        model: "",
        error: "No provider routing for stage",
        settings,
      }),
      message: "No provider configured for this stage.",
    };
  }

  logProviderSelected(settings, stage);

  const { provider, model } = routing;
  const hasKey = providerApiKeyPresent(settings, provider);
  const skipKeyCheck = isRendererE2eMockMode();
  if (
    !skipKeyCheck &&
    (provider === "gemini" ||
      provider === "anthropic" ||
      provider === "groq" ||
      provider === "openrouter") &&
    !hasKey
  ) {
    const failure = buildProviderFailure({
      provider,
      model,
      error: `No ${provider} API key is stored. Add one in settings.`,
      settings,
    });
    logProviderError({
      stage,
      provider,
      model,
      sdkMessage: failure.technicalMessage,
      apiKeyPresent: false,
      settings,
    });
    return {
      ok: false,
      failure,
      message: reliabilityUserMessage(failure.status, failure.technicalMessage),
    };
  }

  let health: HealthResult | null = null;
  try {
    health = await api.checkProviderHealth(provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Health check failed";
    const failure = buildProviderFailure({
      provider,
      model,
      error: message,
      settings,
    });
    logProviderError({
      stage,
      provider,
      model,
      sdkMessage: message,
      apiKeyPresent: hasKey,
      settings,
    });
    return { ok: false, failure, message: failure.userMessage };
  }

  if (health?.ok) {
    console.log(
      `[provider:connection] stage=${stage} provider=${provider} model=${model} ok=true`,
    );
    return { ok: true, provider, model };
  }

  const status = healthToReliabilityStatus(health, settings, provider);
  const sdkMessage = health?.error ?? "Provider health check failed";
  const failure = buildProviderFailure({
    provider,
    model,
    error: sdkMessage,
    settings,
  });
  logProviderError({
    stage,
    provider,
    model,
    sdkMessage,
    responseBody: truncateResponseBody(
      health?.checks?.map((c) => `${c.label}: ${c.detail ?? ""}`).join("; ") ?? "",
    ),
    apiKeyPresent: hasKey,
    settings,
  });
  return {
    ok: false,
    failure: { ...failure, status },
    message: reliabilityUserMessage(status, sdkMessage),
  };
}
