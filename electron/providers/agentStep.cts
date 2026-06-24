import type { ProviderId } from "./settings.cjs";
import { loadRawSettings } from "./settings.cjs";
import type { RawProviderSettings } from "./settings.cjs";
import type { ProviderResponse } from "./types.cjs";
import { fetchJson } from "./types.cjs";
import {
  DEFAULT_GENERATE_TIMEOUT_MS,
  formatProviderTimeoutError,
  isFetchTimeoutError,
} from "./timeouts.cjs";
import { openAiHeaders } from "./openaiCompatible.cjs";
import { DEFAULT_GROQ_MODEL } from "./providerModels.cjs";
import {
  AGENT_STEP_FUNCTION_DECLARATION,
  AGENT_STEP_FUNCTION_NAME,
} from "./agentToolSchema.cjs";
import { isMockProviderEnabled, mockAgentStep } from "./mockProvider.cjs";

import * as gemini from "./gemini.cjs";
import * as groq from "./groq.cjs";
import * as openrouter from "./openrouter.cjs";
import * as anthropic from "./anthropic.cjs";
import * as ollama from "./ollama.cjs";

const IMPLS = { gemini, ollama, anthropic, groq, openrouter } as const;

export interface AgentStepResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  text: string;
  nativeArgs?: Record<string, unknown>;
  nativeToolCall: boolean;
  latencyMs: number;
  raw: unknown;
  error?: string;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function geminiEndpoint(model: string, key: string): string {
  return `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
}

function extractGeminiFunctionArgs(
  json: unknown,
): Record<string, unknown> | null {
  const parts =
    (json as { candidates?: Array<{ content?: { parts?: unknown[] } }> })
      ?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const fn = (part as { functionCall?: { name?: string; args?: unknown } })
      .functionCall;
    if (fn?.name === AGENT_STEP_FUNCTION_NAME && fn.args) {
      if (typeof fn.args === "object" && fn.args !== null) {
        return fn.args as Record<string, unknown>;
      }
      if (typeof fn.args === "string") {
        try {
          return JSON.parse(fn.args) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function runGeminiAgentStep(
  raw: RawProviderSettings,
  prompt: string,
): Promise<AgentStepResult> {
  const model = raw.geminiModel;
  const key = raw.geminiApiKey.trim();
  const start = Date.now();
  if (!key) {
    return {
      ok: false,
      provider: "gemini",
      model,
      text: "",
      nativeToolCall: false,
      latencyMs: 0,
      raw: null,
      error: "No Gemini API key is stored.",
    };
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ functionDeclarations: [AGENT_STEP_FUNCTION_DECLARATION] }],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [AGENT_STEP_FUNCTION_NAME],
      },
    },
    generationConfig: { maxOutputTokens: 512, temperature: 0.2 },
  };

  try {
    const res = await fetchJson(
      geminiEndpoint(model, key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      DEFAULT_GENERATE_TIMEOUT_MS,
    );
    const latencyMs = Date.now() - start;
    const nativeArgs = extractGeminiFunctionArgs(res.json);
    if (nativeArgs) {
      return {
        ok: true,
        provider: "gemini",
        model,
        text: JSON.stringify(nativeArgs),
        nativeArgs,
        nativeToolCall: true,
        latencyMs,
        raw: res.json,
      };
    }
    const text =
      (
        res.json as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        }
      )?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    return {
      ok: Boolean(text),
      provider: "gemini",
      model,
      text,
      nativeToolCall: false,
      latencyMs,
      raw: res.json,
      error: text ? undefined : "Gemini did not return a function call.",
    };
  } catch (err) {
    const message = isFetchTimeoutError(err)
      ? formatProviderTimeoutError("test", DEFAULT_GENERATE_TIMEOUT_MS)
      : err instanceof Error
        ? err.message
        : "Gemini agent step failed.";
    return {
      ok: false,
      provider: "gemini",
      model,
      text: "",
      nativeToolCall: false,
      latencyMs: Date.now() - start,
      raw: null,
      error: message,
    };
  }
}

function extractOpenAiToolArgs(json: unknown): Record<string, unknown> | null {
  const toolCalls = (
    json as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    }
  )?.choices?.[0]?.message?.tool_calls;
  const call = toolCalls?.[0];
  if (call?.function?.name !== AGENT_STEP_FUNCTION_NAME) return null;
  const argsText = call.function.arguments?.trim();
  if (!argsText) return null;
  try {
    return JSON.parse(argsText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runOpenAiAgentStep(
  provider: "groq" | "openrouter",
  raw: RawProviderSettings,
  prompt: string,
): Promise<AgentStepResult> {
  const isGroq = provider === "groq";
  const model = isGroq
    ? raw.groqModel.trim() || DEFAULT_GROQ_MODEL
    : raw.openrouterModel.trim();
  const key = isGroq ? raw.groqApiKey.trim() : raw.openrouterApiKey.trim();
  const apiBase = isGroq ? GROQ_BASE : OPENROUTER_BASE;
  const start = Date.now();

  if (!key) {
    return {
      ok: false,
      provider,
      model,
      text: "",
      nativeToolCall: false,
      latencyMs: 0,
      raw: null,
      error: `No ${provider} API key is stored.`,
    };
  }

  const headers = isGroq
    ? openAiHeaders(key)
    : openAiHeaders(key, {
        "HTTP-Referer": "https://bryantlabs.studio",
        "X-Title": "BryantLabs Studio",
      });

  const body = {
    model,
    max_tokens: 512,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: AGENT_STEP_FUNCTION_DECLARATION,
      },
    ],
    tool_choice: {
      type: "function",
      function: { name: AGENT_STEP_FUNCTION_NAME },
    },
  };

  try {
    const res = await fetchJson(
      `${apiBase}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      DEFAULT_GENERATE_TIMEOUT_MS,
    );
    const latencyMs = Date.now() - start;
    const nativeArgs = extractOpenAiToolArgs(res.json);
    if (nativeArgs) {
      return {
        ok: true,
        provider,
        model,
        text: JSON.stringify(nativeArgs),
        nativeArgs,
        nativeToolCall: true,
        latencyMs,
        raw: res.json,
      };
    }
    const text =
      (
        res.json as {
          choices?: Array<{ message?: { content?: string } }>;
        }
      )?.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      ok: Boolean(text),
      provider,
      model,
      text,
      nativeToolCall: false,
      latencyMs,
      raw: res.json,
      error: text ? undefined : `${provider} did not return a tool call.`,
    };
  } catch (err) {
    const message = isFetchTimeoutError(err)
      ? formatProviderTimeoutError("test", DEFAULT_GENERATE_TIMEOUT_MS)
      : err instanceof Error
        ? err.message
        : `${provider} agent step failed.`;
    return {
      ok: false,
      provider,
      model,
      text: "",
      nativeToolCall: false,
      latencyMs: Date.now() - start,
      raw: null,
      error: message,
    };
  }
}

async function runTextFallbackAgentStep(
  provider: ProviderId,
  raw: RawProviderSettings,
  prompt: string,
): Promise<AgentStepResult> {
  const impl = IMPLS[provider as keyof typeof IMPLS];
  if (!impl?.test) {
    return {
      ok: false,
      provider,
      model: "",
      text: "",
      nativeToolCall: false,
      latencyMs: 0,
      raw: null,
      error: `Agent step unsupported for provider: ${provider}`,
    };
  }
  const res: ProviderResponse = await impl.test(raw, prompt);
  return {
    ok: res.ok,
    provider: res.provider,
    model: res.model,
    text: res.text,
    nativeToolCall: false,
    latencyMs: res.latencyMs,
    raw: res.raw,
    ...(res.error !== undefined ? { error: res.error } : {}),
  };
}

/** Provider-native agent step (function calling when supported, else JSON text). */
export async function runAgentStep(
  provider: ProviderId,
  prompt: string,
): Promise<AgentStepResult> {
  if (isMockProviderEnabled()) return mockAgentStep(provider, prompt);
  const raw = await loadRawSettings();

  if (provider === "gemini") {
    return runGeminiAgentStep(raw, prompt);
  }
  if (provider === "groq" || provider === "openrouter") {
    return runOpenAiAgentStep(provider, raw, prompt);
  }
  return runTextFallbackAgentStep(provider, raw, prompt);
}
