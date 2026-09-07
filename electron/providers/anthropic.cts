import type { RawProviderSettings } from "./settings.cjs";
import {
  DEFAULT_GENERATE_TIMEOUT_MS,
  formatProviderTimeoutError,
  isFetchTimeoutError,
  resolveGenerateTimeout,
  shouldRetryIdenticalHttpOnTransportError,
  type ProviderGenerateOptions,
} from "./timeouts.cjs";
import {
  fetchJson,
  type HealthResult,
  type ProviderResponse,
} from "./types.cjs";
import { createTransportRequestId, isTruncatedHttpJsonBodyError } from "./httpJson.cjs";
import {
  ANTHROPIC_MESSAGES_SERIALIZER,
  buildAnthropicMessagesRequest,
  diffAnthropicRequestStructures,
  type AnthropicRequestStructure,
} from "./anthropicMessagesRequest.cjs";

const API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const HEALTH_TIMEOUT_MS = 25_000;

/** Last successful Messages request structure in this process (sanitized). */
let lastSuccessfulStructure: AnthropicRequestStructure | null = null;

type ConnectionStatus =
  | "connected"
  | "invalid_key"
  | "rate_limited"
  | "offline"
  | "unknown";

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

function classifyStatus(
  httpStatus: number | null,
  err: unknown,
): ConnectionStatus {
  if (httpStatus === 401 || httpStatus === 403) return "invalid_key";
  if (httpStatus === 429) return "rate_limited";
  if (err && isOfflineError(err)) return "offline";
  return "unknown";
}

function isOfflineError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === "AbortError" ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("timeout")
  );
}

function parseModelIds(json: unknown): string[] {
  const data = json as {
    data?: Array<{ id?: string; type?: string }>;
  };
  const ids = (data?.data ?? [])
    .filter((m) => (m.type ?? "model") === "model")
    .map((m) => m.id?.trim() ?? "")
    .filter((id) => id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function extractApiError(json: unknown): string | null {
  const data = json as { error?: { message?: string } };
  const msg = data?.error?.message?.trim();
  return msg && msg.length > 0 ? msg : null;
}

function extractMessageText(json: unknown): string {
  const data = json as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const blocks = data?.content ?? [];
  return blocks
    .filter((b) => b.type === "text" || b.text !== undefined)
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

async function listModels(
  apiKey: string,
  timeoutMs: number,
): Promise<{ models: string[]; httpStatus: number | null; error: string | null }> {
  try {
    const res = await fetchJson(
      `${API_BASE}/models`,
      { method: "GET", headers: anthropicHeaders(apiKey) },
      timeoutMs,
    );
    const apiError = extractApiError(res.json);
    if (!res.ok) {
      return {
        models: [],
        httpStatus: res.status,
        error: apiError ?? `List models failed (HTTP ${res.status}).`,
      };
    }
    return {
      models: parseModelIds(res.json),
      httpStatus: res.status,
      error: apiError,
    };
  } catch (err) {
    return {
      models: [],
      httpStatus: null,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }
}

async function createMessage(
  model: string,
  apiKey: string,
  prompt: string,
  maxTokens: number,
  timeoutMs: number,
  temperature?: number,
  attempt = 1,
): Promise<{
  ok: boolean;
  text: string;
  raw: unknown;
  httpStatus: number;
  error: string | null;
}> {
  const built = buildAnthropicMessagesRequest({
    model,
    prompt,
    maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
  });

  const requestId = createTransportRequestId("anthropic");
  console.log(
    `[anthropic:request:structure] ${JSON.stringify({
      requestId,
      attempt,
      serializer: built.serializer,
      payloadByteLength: built.byteLength,
      hashBeforeValidation: built.hashBeforeValidation,
      hashBeforeSend: built.hashBeforeSend,
      localJsonParse: built.localJsonParse,
      ...(built.localJsonParseError
        ? {
            localJsonParseError: built.localJsonParseError,
            localJsonParseOffset: built.localJsonParseOffset,
          }
        : {}),
      schemaResult: built.schemaResult,
      topLevelKeys: built.structure.topLevelKeys,
      fieldTypeMap: built.structure.fieldTypeMap,
      messageCount: built.structure.messageCount,
      contentBlockTypes: built.structure.contentBlockTypes,
      toolCount: built.structure.toolCount,
      hasSystem: built.structure.hasSystem,
      hasToolChoice: built.structure.hasToolChoice,
    })}`,
  );

  if (built.localJsonParse !== "pass" || built.schemaResult !== "ok") {
    return {
      ok: false,
      text: "",
      raw: null,
      httpStatus: 0,
      error: `Local Anthropic request validation failed (${built.schemaResult}).`,
    };
  }

  // Guard: hash must be stable from validation → send (no post-serialize mutation).
  if (built.hashBeforeValidation !== built.hashBeforeSend) {
    return {
      ok: false,
      text: "",
      raw: null,
      httpStatus: 0,
      error: "Anthropic request hash changed after validation (body mutated).",
    };
  }

  console.log(
    `[anthropic:transport:start] ${JSON.stringify({
      requestId,
      attempt,
      payloadByteLength: built.byteLength,
      serializer: ANTHROPIC_MESSAGES_SERIALIZER,
      timeoutMs,
    })}`,
  );

  const res = await fetchJson(
    `${API_BASE}/messages`,
    {
      method: "POST",
      headers: {
        ...anthropicHeaders(apiKey),
        "Content-Type": "application/json",
      },
      // Single-serialize UTF-8 string; encodeRequestBody → Buffer (same bytes as bodyBuffer).
      body: built.serialized,
    },
    timeoutMs,
    {
      attempt,
      requestId,
      structure: {
        localJsonParse: built.localJsonParse,
        topLevelKeys: built.structure.topLevelKeys,
        fieldTypeMap: built.structure.fieldTypeMap,
        messageCount: built.structure.messageCount,
        contentBlockTypes: built.structure.contentBlockTypes,
        toolCount: built.structure.toolCount,
        schemaResult: built.schemaResult,
        serializer: built.serializer,
        hashBeforeValidation: built.hashBeforeValidation,
        hashBeforeSend: built.hashBeforeSend,
        hashAtSocketWrite: null,
      },
    },
  );
  const apiError = extractApiError(res.json);
  const hashAtWrite = res.transport?.payloadSha256 ?? null;
  if (res.transport) {
    console.log(
      `[anthropic:transport:done] ${JSON.stringify({
        requestId,
        attempt,
        payloadByteLength: res.transport.payloadByteLength,
        bytesWritten: res.transport.bytesWritten,
        payloadSha256: res.transport.payloadSha256,
        hashBeforeValidation: built.hashBeforeValidation,
        hashBeforeSend: built.hashBeforeSend,
        hashAtSocketWrite: hashAtWrite,
        hashesMatch:
          built.hashBeforeSend === hashAtWrite &&
          built.hashBeforeValidation === built.hashBeforeSend,
        contentLengthHeader: res.transport.contentLengthHeader,
        responseByteLength: res.transport.responseByteLength,
        responseSha256: res.transport.responseSha256,
        httpStatus: res.status,
        providerRequestId: res.transport.providerRequestId,
        truncationSource: res.transport.truncationSource,
        parserStage: res.transport.parserStage,
        bodyFullyFlushed: res.transport.bodyFullyFlushed,
        aborted: res.transport.aborted,
        completed: res.transport.completed,
        socketEvents: res.transport.socketEvents,
        serializer: ANTHROPIC_MESSAGES_SERIALIZER,
        schemaResult: built.schemaResult,
        localJsonParse: built.localJsonParse,
        ...(apiError ? { apiErrorKind: "anthropic_api_error_message" } : {}),
      })}`,
    );
  }

  const ok = res.ok && !apiError;
  if (ok) {
    lastSuccessfulStructure = built.structure;
  } else if (
    apiError &&
    isTruncatedHttpJsonBodyError(apiError) &&
    lastSuccessfulStructure
  ) {
    const diff = diffAnthropicRequestStructures(
      built.structure,
      lastSuccessfulStructure,
    );
    console.log(
      `[anthropic:request:structure-diff] ${JSON.stringify({
        requestId,
        attempt,
        httpStatus: res.status,
        failed: built.structure,
        lastSuccess: lastSuccessfulStructure,
        diff,
        note: "Anthropic rejected request JSON — structural comparison only",
      })}`,
    );
  }

  return {
    ok,
    text: ok ? extractMessageText(res.json) : "",
    raw: res.json,
    httpStatus: res.status,
    error: ok ? null : (apiError ?? `Request failed (HTTP ${res.status}).`),
  };
}

function mapGenerateError(
  err: unknown,
  operation: ProviderGenerateOptions["operation"],
  timeoutMs: number,
): string {
  if (isFetchTimeoutError(err)) {
    return formatProviderTimeoutError(operation, timeoutMs, err);
  }
  return err instanceof Error ? err.message : "Anthropic request failed.";
}

function resolveTestModel(
  configured: string,
  discovered: string[],
): string | null {
  const trimmed = configured.trim();
  if (trimmed.length > 0) {
    if (discovered.length === 0) return trimmed;
    if (discovered.includes(trimmed)) return trimmed;
    return trimmed;
  }
  return discovered[0] ?? null;
}

export async function health(raw: RawProviderSettings): Promise<HealthResult> {
  const model = raw.anthropicModel;
  const hasKey = raw.anthropicApiKey.trim().length > 0;
  const result: HealthResult = {
    ok: false,
    provider: "anthropic",
    model,
    checks: [{ label: "API key present", ok: hasKey }],
    connectionStatus: hasKey ? "unknown" : "invalid_key",
  };

  if (!hasKey) {
    result.error = "No Anthropic API key is stored. Add one in settings.";
    result.connectionStatus = "invalid_key";
    return result;
  }

  const key = raw.anthropicApiKey;
  let listErr: unknown = null;
  let listHttp: number | null = null;
  const listed = await listModels(key, HEALTH_TIMEOUT_MS);
  listHttp = listed.httpStatus;
  if (listed.error && listed.models.length === 0) {
    listErr = new Error(listed.error);
  }

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
    result.connectionStatus = classifyStatus(listHttp, listErr);
    result.error =
      listed.error ?? "Could not list Anthropic models. Check your API key.";
    return result;
  }

  const testModel = resolveTestModel(model, listed.models);
  if (!testModel) {
    result.checks.push({
      label: "Model selected",
      ok: false,
      detail: "Choose a model from the dropdown",
    });
    result.error = "Select an Anthropic model, then save settings.";
    result.connectionStatus = "unknown";
    return result;
  }

  result.checks.push({
    label: "Model selected",
    ok: true,
    detail: testModel,
  });

  try {
    const test = await createMessage(
      testModel,
      key,
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
    result.connectionStatus = ok ? "connected" : classifyStatus(test.httpStatus, null);
    if (!ok) {
      result.error = test.error ?? `Request failed (HTTP ${test.httpStatus}).`;
      if (test.httpStatus === 401 || test.httpStatus === 403) {
        result.connectionStatus = "invalid_key";
      } else if (test.httpStatus === 429) {
        result.connectionStatus = "rate_limited";
      }
    }
  } catch (err) {
    result.checks.push({
      label: "Test request succeeds",
      ok: false,
      detail: "Network error",
    });
    result.connectionStatus = classifyStatus(null, err);
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
  const model = raw.anthropicModel.trim();
  const start = Date.now();
  const { timeoutMs, operation } = resolveGenerateTimeout(options);
  const temperature = options?.temperature;

  if (raw.anthropicApiKey.trim().length === 0) {
    return {
      ok: false,
      provider: "anthropic",
      model,
      text: "",
      raw: null,
      latencyMs: 0,
      error: "No Anthropic API key is stored. Add one in settings.",
    };
  }
  if (!model) {
    return {
      ok: false,
      provider: "anthropic",
      model: "",
      text: "",
      raw: null,
      latencyMs: 0,
      error: "No Anthropic model selected. Choose a model in Providers settings.",
    };
  }

  try {
    let attempt = 1;
    let res = await createMessage(
      model,
      raw.anthropicApiKey,
      prompt,
      maxOutputTokens,
      timeoutMs,
      temperature,
      attempt,
    );
    if (!res.ok && isTruncatedHttpJsonBodyError(res.error)) {
      attempt = 2;
      res = await createMessage(
        model,
        raw.anthropicApiKey,
        prompt,
        maxOutputTokens,
        timeoutMs,
        temperature,
        attempt,
      );
    }
    return {
      ok: res.ok,
      provider: "anthropic",
      model,
      text: res.text,
      raw: res.raw,
      latencyMs: Date.now() - start,
      timeoutMs,
      error: res.error ?? undefined,
    };
  } catch (err) {
    const transportMsg = err instanceof Error ? err.message : String(err);
    if (shouldRetryIdenticalHttpOnTransportError(err) || isTruncatedHttpJsonBodyError(transportMsg)) {
      try {
        const res = await createMessage(
          model,
          raw.anthropicApiKey,
          prompt,
          maxOutputTokens,
          timeoutMs,
          temperature,
          2,
        );
        return {
          ok: res.ok,
          provider: "anthropic",
          model,
          text: res.text,
          raw: res.raw,
          latencyMs: Date.now() - start,
          timeoutMs,
          error: res.error ?? undefined,
        };
      } catch (retryErr) {
        return {
          ok: false,
          provider: "anthropic",
          model,
          text: "",
          raw: null,
          latencyMs: Date.now() - start,
          timeoutMs,
          error: mapGenerateError(retryErr, operation, timeoutMs),
        };
      }
    }
    return {
      ok: false,
      provider: "anthropic",
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
