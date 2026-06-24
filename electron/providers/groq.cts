import type { RawProviderSettings } from "./settings.cjs";
import { DEFAULT_GROQ_MODEL } from "./providerModels.cjs";
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

const API_BASE = "https://api.groq.com/openai/v1";
const HEALTH_TIMEOUT_MS = 25_000;

function groqConfig(apiKey: string) {
  return { apiBase: API_BASE, apiKey };
}

function mapGenerateError(
  err: unknown,
  operation: ProviderGenerateOptions["operation"],
  timeoutMs: number,
): string {
  if (isFetchTimeoutError(err)) {
    return formatProviderTimeoutError(operation, timeoutMs);
  }
  return err instanceof Error ? err.message : "Groq request failed.";
}

function resolveTestModel(configured: string, discovered: string[]): string | null {
  const trimmed = configured.trim();
  if (trimmed.length > 0) return trimmed;
  return discovered[0] ?? DEFAULT_GROQ_MODEL;
}

export async function health(raw: RawProviderSettings): Promise<HealthResult> {
  const model = raw.groqModel.trim() || DEFAULT_GROQ_MODEL;
  const hasKey = raw.groqApiKey.trim().length > 0;
  const result: HealthResult = {
    ok: false,
    provider: "groq",
    model,
    checks: [{ label: "API key present", ok: hasKey }],
    connectionStatus: hasKey ? "unknown" : "invalid_key",
  };

  if (!hasKey) {
    result.error = "No Groq API key is stored. Add one in settings.";
    result.connectionStatus = "invalid_key";
    return result;
  }

  const key = raw.groqApiKey;
  const listed = await listOpenAiModels(groqConfig(key), HEALTH_TIMEOUT_MS);

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
      detail: listed.error ?? "No models returned",
    });
    result.connectionStatus = classifyOpenAiConnectionStatus(
      listed.httpStatus,
      listed.error ? new Error(listed.error) : null,
      listed.error ?? undefined,
    );
    result.error =
      listed.error ?? "Could not list Groq models. Check your API key.";
    return result;
  }

  const testModel = resolveTestModel(raw.groqModel, listed.models);
  if (!testModel) {
    result.checks.push({
      label: "Model selected",
      ok: false,
      detail: "Choose a model from the dropdown",
    });
    result.error = "Select a Groq model, then save settings.";
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
      groqConfig(key),
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
  const model = raw.groqModel.trim() || DEFAULT_GROQ_MODEL;
  const start = Date.now();
  const { timeoutMs, operation } = resolveGenerateTimeout(options);
  const temperature = options?.temperature;

  if (raw.groqApiKey.trim().length === 0) {
    return {
      ok: false,
      provider: "groq",
      model,
      text: "",
      raw: null,
      latencyMs: 0,
      error: "No Groq API key is stored. Add one in settings.",
    };
  }

  try {
    const res = await createOpenAiChatCompletion(
      groqConfig(raw.groqApiKey),
      model,
      prompt,
      maxOutputTokens,
      timeoutMs,
      temperature,
    );
    return {
      ok: res.ok,
      provider: "groq",
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
      provider: "groq",
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
