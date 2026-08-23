import { createHash } from "node:crypto";
import { sanitizeProviderPrompt } from "./sanitizePrompt.cjs";

/** Shared Anthropic Messages request serializer — single path for all stages. */
export const ANTHROPIC_MESSAGES_SERIALIZER = "anthropicMessagesRequest/v1";

export type AnthropicContentBlock = {
  readonly type: "text";
  readonly text: string;
};

export type AnthropicMessage = {
  readonly role: "user" | "assistant";
  readonly content: string | readonly AnthropicContentBlock[];
};

export type AnthropicMessagesRequest = {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: readonly AnthropicMessage[];
  readonly temperature?: number;
  readonly system?: string | readonly AnthropicContentBlock[];
  readonly tools?: readonly unknown[];
  readonly tool_choice?: unknown;
  readonly metadata?: Record<string, unknown>;
};

export type AnthropicSchemaErrorCode =
  | "ok"
  | "not_object"
  | "missing_model"
  | "missing_max_tokens"
  | "invalid_max_tokens"
  | "missing_messages"
  | "empty_messages"
  | "invalid_message_role"
  | "invalid_message_content"
  | "invalid_content_block"
  | "unexpected_top_level_type"
  | "local_json_parse_failed"
  | "double_encoded_string"
  | "trailing_bytes_after_json"
  | "control_or_surrogate_leak";

export interface AnthropicRequestStructure {
  readonly topLevelKeys: readonly string[];
  readonly fieldTypeMap: Readonly<Record<string, string>>;
  readonly messageCount: number;
  readonly contentBlockTypes: readonly (string | readonly string[])[];
  readonly toolCount: number;
  readonly hasSystem: boolean;
  readonly hasToolChoice: boolean;
  readonly hasMetadata: boolean;
  readonly modelType: string;
  readonly maxTokensType: string;
}

export interface AnthropicSerializeResult {
  readonly serializer: typeof ANTHROPIC_MESSAGES_SERIALIZER;
  readonly request: AnthropicMessagesRequest;
  readonly serialized: string;
  readonly bodyBuffer: Buffer;
  readonly byteLength: number;
  readonly hashBeforeValidation: string;
  readonly hashBeforeSend: string;
  readonly localJsonParse: "pass" | "fail";
  readonly localJsonParseError: string | null;
  readonly localJsonParseOffset: number | null;
  readonly schemaResult: AnthropicSchemaErrorCode;
  readonly structure: AnthropicRequestStructure;
}

function sha16(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function describeAnthropicRequestStructure(
  value: unknown,
): AnthropicRequestStructure {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const messages = Array.isArray(obj.messages) ? obj.messages : [];
  const contentBlockTypes = messages.map((m) => {
    const content = (m as { content?: unknown })?.content;
    if (typeof content === "string") return "string";
    if (Array.isArray(content)) {
      return content.map((b) =>
        b && typeof b === "object" && "type" in b
          ? String((b as { type: unknown }).type)
          : typeName(b),
      );
    }
    return typeName(content);
  });
  return {
    topLevelKeys: Object.keys(obj).sort(),
    fieldTypeMap: Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, typeName(v)]),
    ),
    messageCount: messages.length,
    contentBlockTypes,
    toolCount: Array.isArray(obj.tools) ? obj.tools.length : 0,
    hasSystem: obj.system != null,
    hasToolChoice: obj.tool_choice != null,
    hasMetadata: obj.metadata != null,
    modelType: typeName(obj.model),
    maxTokensType: typeName(obj.max_tokens),
  };
}

function validateContent(
  content: unknown,
): AnthropicSchemaErrorCode {
  if (typeof content === "string") return "ok";
  if (!Array.isArray(content) || content.length === 0) {
    return "invalid_message_content";
  }
  for (const block of content) {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      return "invalid_content_block";
    }
    const b = block as { type?: unknown; text?: unknown };
    if (b.type !== "text" || typeof b.text !== "string") {
      return "invalid_content_block";
    }
  }
  return "ok";
}

/** Validate official Anthropic Messages request shape (no body retained). */
export function validateAnthropicMessagesSchema(
  value: unknown,
): AnthropicSchemaErrorCode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "not_object";
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.model !== "string" || !obj.model.trim()) return "missing_model";
  if (!("max_tokens" in obj)) return "missing_max_tokens";
  if (typeof obj.max_tokens !== "number" || !Number.isInteger(obj.max_tokens) || obj.max_tokens < 1) {
    return "invalid_max_tokens";
  }
  if (!Array.isArray(obj.messages)) return "missing_messages";
  if (obj.messages.length === 0) return "empty_messages";
  for (const message of obj.messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return "invalid_message_role";
    }
    const m = message as { role?: unknown; content?: unknown };
    if (m.role !== "user" && m.role !== "assistant") return "invalid_message_role";
    const contentCode = validateContent(m.content);
    if (contentCode !== "ok") return contentCode;
  }
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) return "unexpected_top_level_type";
    if (typeof val === "bigint") return "unexpected_top_level_type";
    if (key === "temperature" && val != null && typeof val !== "number") {
      return "unexpected_top_level_type";
    }
  }
  return "ok";
}

function localParseCheck(serialized: string): {
  ok: boolean;
  error: string | null;
  offset: number | null;
  value: unknown;
} {
  try {
    const value = JSON.parse(serialized);
    // Detect accidental double-encoding (top-level JSON string of JSON).
    if (typeof value === "string") {
      return {
        ok: false,
        error: "double_encoded_string",
        offset: 0,
        value,
      };
    }
    // JSON.parse already rejects trailing data in modern Node.
    return { ok: true, error: null, offset: null, value };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const offsetMatch = msg.match(/position\s+(\d+)/i) ?? msg.match(/at position (\d+)/i);
    return {
      ok: false,
      error: msg.slice(0, 160),
      offset: offsetMatch ? Number(offsetMatch[1]) : null,
      value: null,
    };
  }
}

/**
 * Build the exact Anthropic Messages body once.
 * Uses official content-block shape (text blocks) for user content.
 */
export function buildAnthropicMessagesRequest(input: {
  readonly model: string;
  readonly prompt: string;
  readonly maxTokens: number;
  readonly temperature?: number;
  readonly system?: string;
}): AnthropicSerializeResult {
  const safePrompt = sanitizeProviderPrompt(input.prompt);
  const request: AnthropicMessagesRequest = {
    model: input.model.trim(),
    max_tokens: input.maxTokens,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: safePrompt }],
      },
    ],
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.system != null && input.system.length > 0
      ? { system: sanitizeProviderPrompt(input.system) }
      : {}),
  };

  // Serialize exactly once — never string-interpolate JSON.
  const serialized = JSON.stringify(request);
  const hashBeforeValidation = sha16(serialized);
  const parsed = localParseCheck(serialized);
  let schemaResult: AnthropicSchemaErrorCode = "ok";
  if (!parsed.ok) {
    schemaResult =
      parsed.error === "double_encoded_string"
        ? "double_encoded_string"
        : "local_json_parse_failed";
  } else {
    schemaResult = validateAnthropicMessagesSchema(parsed.value);
  }

  const bodyBuffer = Buffer.from(serialized, "utf8");
  // Freeze: copy so later mutation cannot change what we validated.
  const frozen = Buffer.from(bodyBuffer);

  return {
    serializer: ANTHROPIC_MESSAGES_SERIALIZER,
    request,
    serialized,
    bodyBuffer: frozen,
    byteLength: frozen.length,
    hashBeforeValidation,
    hashBeforeSend: sha16(frozen),
    localJsonParse: parsed.ok ? "pass" : "fail",
    localJsonParseError: parsed.error,
    localJsonParseOffset: parsed.offset,
    schemaResult,
    structure: describeAnthropicRequestStructure(request),
  };
}

/** Compare two sanitized structures (no secrets). */
export function diffAnthropicRequestStructures(
  failed: AnthropicRequestStructure,
  succeeded: AnthropicRequestStructure,
): {
  readonly keysOnlyInFailed: readonly string[];
  readonly keysOnlyInSucceeded: readonly string[];
  readonly typeMismatches: readonly string[];
  readonly messageCountDelta: number;
  readonly contentShapeChanged: boolean;
  readonly toolCountDelta: number;
} {
  const failedKeys = new Set(failed.topLevelKeys);
  const okKeys = new Set(succeeded.topLevelKeys);
  const keysOnlyInFailed = failed.topLevelKeys.filter((k) => !okKeys.has(k));
  const keysOnlyInSucceeded = succeeded.topLevelKeys.filter((k) => !failedKeys.has(k));
  const typeMismatches: string[] = [];
  for (const key of failed.topLevelKeys) {
    if (
      succeeded.fieldTypeMap[key] != null &&
      failed.fieldTypeMap[key] !== succeeded.fieldTypeMap[key]
    ) {
      typeMismatches.push(
        `${key}:${failed.fieldTypeMap[key]}!=${succeeded.fieldTypeMap[key]}`,
      );
    }
  }
  return {
    keysOnlyInFailed,
    keysOnlyInSucceeded,
    typeMismatches,
    messageCountDelta: failed.messageCount - succeeded.messageCount,
    contentShapeChanged:
      JSON.stringify(failed.contentBlockTypes) !==
      JSON.stringify(succeeded.contentBlockTypes),
    toolCountDelta: failed.toolCount - succeeded.toolCount,
  };
}
