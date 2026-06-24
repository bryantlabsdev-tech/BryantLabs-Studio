import type { RawProviderSettings } from "./settings.cjs";
import { DEFAULT_OPENROUTER_MODEL } from "./providerModels.cjs";
import {
  DEFAULT_GENERATE_TIMEOUT_MS,
  formatProviderTimeoutError,
  isFetchTimeoutError,
  resolveGenerateTimeout,
  type ProviderGenerateOptions,
} from "./timeouts.cjs";
import {
  classifyOpenAiConnectionStatus,
  createOpenAiChatCompletion,
  listOpenAiModels,
} from "./openaiCompatible.cjs";
import type { HealthResult, ProviderResponse } from "./types.cjs";

const API_BASE = "https://openrouter.ai/api/v1";
const HEALTH_TIMEOUT_MS = 25_000;

function openRouterConfig(apiKey: string) {
  return {
    apiBase: API_BASE,
    apiKey,
    extraHeaders: {
      "HTTP-Referer": "https://bryantlabs.studio",
      "X-Title": "BryantLabs Studio",
    },
  };
}

function mapGenerateError(
  err: unknown,
  operation: ProviderGenerateOptions["operation"],
  timeoutMs: number,
): string {
  if (isFetchTimeoutError(err)) {
    return formatProviderTimeoutError(operation, timeoutMs);
  }
  return err instanceof Error ? err.message : "OpenRouter request failed.";
}

function resolveTestModel(configured: string, discovered: string[]): string | null {
  const trimmed = configured.trim();
  if (trimmed.length > 0) return trimmed;
  return discovered[0] ?? DEFAULT_OPENROUTER_MODEL;
}

export async function health(raw: RawProviderSettings): Promise<HealthResult> {
  const model = raw.openrouterModel.trim() || DEFAULT_OPENROUTER_MODEL;
  const hasKey = raw.openrouterApiKey.trim().length > 0;
  const result: HealthResult = {
    ok: false,
    provider: "openrouter",
    model,
    checks: [{ label: "API key present", ok: hasKey }],
    connectionStatus: hasKey ? "unknown" : "invalid_key",
  };

  if (!hasKey) {
    result.error = "No OpenRouter API key is stored. Add one in settings.";
    result.connectionStatus = "invalid_key";
    return result;
  }

  const key = raw.openrouterApiKey;
  const listed = await listOpenAiModels(openRouterConfig(key), HEALTH_TIMEOUT_MS);

  if (listed.models.length > 0) {
    result.models = listed.models;
    result.checks.push({
      label: "Models discovered",
      ok: true,
      detail: `${listed.models.length} available`,
    });
  } else {
    result.checks.push({
      label: "Models discovered",
      ok: false,
      detail: listed.error ?? "No models returned (using configured model)",
    });
  }

  const testModel = resolveTestModel(
    raw.openrouterModel,
    listed.models.length > 0 ? listed.models : [DEFAULT_OPENROUTER_MODEL],
  );
  if (!testModel) {
    result.checks.push({
      label: "Model selected",
      ok: false,
      detail: "Choose a model from the dropdown",
    });
    result.error = "Select an OpenRouter model, then save settings.";
    result.connectionStatus = "unknown";
    return result;
  }

  result.checks.push({
    label: "Model selected",
    ok: true,
    detail: testModel,
  });
  result.model = testModel;

  try {
    const test = await createOpenAiChatCompletion(
      openRouterConfig(key),
      testModel,
      "Hello",
      16,
      HEALTH_TIMEOUT_MS,
    );
    const ok = test.ok;
    result.checks.push({
      label: "Test request succeeds",
      ok,
      detail: ok ? `HTTP ${test.httpStatus}` : (test.error ?? `HTTP ${test.httpStatus}`),
    });
    result.ok = ok;
    result.connectionStatus = ok
      ? "connected"
      : classifyOpenAiConnectionStatus(test.httpStatus, null, test.error ?? undefined);
    if (!ok) {
      result.error = test.error ?? `Request failed (HTTP ${test.httpStatus}).`;
    }
  } catch (err) {
    result.checks.push({
      label: "Test request succeeds",
      ok: false,
      detail: "Network error",
    });
    result.connectionStatus = classifyOpenAiConnectionStatus(null, err);
    result.error = err instanceof Error ? err.message : "Network error.";
  }

  return result;
}

export async function generate(
  raw: RawProviderSettings,
  prompt: string,
  maxOutputTokens = 256,
  options?: ProviderGenerateOptions,
): Promise<ProviderResponse> {
  const model = raw.openrouterModel.trim() || DEFAULT_OPENROUTER_MODEL;
  const start = Date.now();
  const { timeoutMs, operation } = resolveGenerateTimeout(options);
  const temperature = options?.temperature;

  if (raw.openrouterApiKey.trim().length === 0) {
    return {
      ok: false,
      provider: "openrouter",
      model,
      text: "",
      raw: null,
      latencyMs: 0,
      error: "No OpenRouter API key is stored. Add one in settings.",
    };
  }

  try {
    const res = await createOpenAiChatCompletion(
      openRouterConfig(raw.openrouterApiKey),
      model,
      prompt,
      maxOutputTokens,
      timeoutMs,
      temperature,
    );
    return {
      ok: res.ok,
      provider: "openrouter",
      model,
      text: res.text,
      raw: res.raw,
      latencyMs: Date.now() - start,
      timeoutMs,
      error: res.error ?? undefined,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "openrouter",
      model,
      text: "",
      raw: null,
      latencyMs: Date.now() - start,
      timeoutMs,
      error: mapGenerateError(err, operation, timeoutMs),
    };
  }
}

export async function test(
  raw: RawProviderSettings,
  prompt: string,
): Promise<ProviderResponse> {
  return generate(raw, prompt, 256, {
    timeoutMs: DEFAULT_GENERATE_TIMEOUT_MS,
    operation: "test",
  });
}
