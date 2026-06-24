import type { RawProviderSettings } from "./settings.cjs";
import {
  DEFAULT_GENERATE_TIMEOUT_MS,
  formatProviderTimeoutError,
  isFetchTimeoutError,
  resolveGenerateTimeout,
  type ProviderGenerateOptions,
} from "./timeouts.cjs";
import {
  fetchJson,
  type HealthResult,
  type ProviderResponse,
} from "./types.cjs";
import {
  classifyReliabilityFromError,
  isOfflineError,
  reliabilityToConnectionStatus,
} from "./reliability.cjs";

/**
 * Ollama provider (local server). Read-only: lists models, verifies the
 * selected model exists, and answers a single test prompt. No project context.
 */

/** Health check test prompt only — not used for plan/patch/greenfield generate. */
const HEALTH_TEST_TIMEOUT_MS = 30_000;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function listModels(base: string): Promise<string[]> {
  const res = await fetchJson(`${base}/api/tags`, { method: "GET" }, 8_000);
  const data = res.json as { models?: Array<{ name?: string }> };
  return (data?.models ?? [])
    .map((m) => m.name ?? "")
    .filter((n) => n.length > 0);
}

function extractText(json: unknown): string {
  const data = json as { response?: string };
  return (data?.response ?? "").trim();
}

export async function health(raw: RawProviderSettings): Promise<HealthResult> {
  const base = trimSlash(raw.ollamaBaseUrl);
  const model = raw.ollamaModel;
  const result: HealthResult = {
    ok: false,
    provider: "ollama",
    model,
    checks: [],
  };

  let models: string[] = [];
  try {
    models = await listModels(base);
    result.models = models;
    result.checks.push({
      label: "Server reachable",
      ok: true,
      detail: `${models.length} model(s) installed`,
    });
  } catch (err) {
    result.connectionStatus = "offline";
    result.checks.push({
      label: "Server reachable",
      ok: false,
      detail: `Cannot reach ${base}`,
    });
    result.error =
      err instanceof Error ? err.message : "Ollama server is unreachable.";
    return result;
  }

  result.connectionStatus = "connected";

  // Ollama tags include the tag suffix (e.g. "llama3.2:latest").
  const modelExists = models.some(
    (m) => m === model || m.split(":")[0] === model,
  );
  result.checks.push({
    label: "Selected model installed",
    ok: modelExists,
    detail: modelExists ? model : `"${model}" not found`,
  });
  if (!modelExists) {
    result.connectionStatus = reliabilityToConnectionStatus("model_missing");
    result.error = `Model "${model}" is not installed. Run: ollama pull ${model}`;
    return result;
  }

  try {
    const res = await fetchJson(
      `${base}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: "Hello", stream: false }),
      },
      HEALTH_TEST_TIMEOUT_MS,
    );
    const ok = res.ok;
    result.checks.push({
      label: "Test prompt succeeds",
      ok,
      detail: ok ? `HTTP ${res.status}` : `HTTP ${res.status}`,
    });
    result.ok = ok;
    if (!ok) {
      result.connectionStatus = reliabilityToConnectionStatus(
        classifyReliabilityFromError(`HTTP ${res.status}`, res.status),
      );
      result.error = `Test prompt failed (HTTP ${res.status}).`;
    }
  } catch (err) {
    const reliability = isOfflineError(err)
      ? "offline"
      : classifyReliabilityFromError(err instanceof Error ? err.message : "");
    result.connectionStatus = reliabilityToConnectionStatus(reliability);
    result.checks.push({
      label: "Test prompt succeeds",
      ok: false,
      detail: "Request failed",
    });
    result.error = err instanceof Error ? err.message : "Test prompt failed.";
  }
  return result;
}

function mapGenerateError(
  err: unknown,
  operation: ProviderGenerateOptions["operation"],
  timeoutMs: number,
): string {
  if (isFetchTimeoutError(err)) {
    return formatProviderTimeoutError(operation, timeoutMs);
  }
  return err instanceof Error ? err.message : "Ollama request failed.";
}

export async function generate(
  raw: RawProviderSettings,
  prompt: string,
  _maxOutputTokens = 256,
  options?: ProviderGenerateOptions,
): Promise<ProviderResponse> {
  const base = trimSlash(raw.ollamaBaseUrl);
  const model = raw.ollamaModel;
  const start = Date.now();
  const { timeoutMs, operation } = resolveGenerateTimeout(options);
  const temperature = options?.temperature;
  try {
    const body: {
      model: string;
      prompt: string;
      stream: boolean;
      options?: { temperature: number };
    } = { model, prompt, stream: false };
    if (temperature !== undefined) body.options = { temperature };

    const res = await fetchJson(
      `${base}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    return {
      ok: res.ok,
      provider: "ollama",
      model,
      text: res.ok ? extractText(res.json) : "",
      raw: res.json,
      latencyMs: Date.now() - start,
      timeoutMs,
      error: res.ok ? undefined : `Request failed (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "ollama",
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
