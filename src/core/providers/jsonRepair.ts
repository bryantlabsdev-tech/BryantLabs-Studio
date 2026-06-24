export type JsonRepairOutcome =
  | { ok: true; json: string; method: "direct" | "extracted" | "repaired" | "schema_retry" }
  | { ok: false; reason: "no_json" | "invalid" };

const FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/gi;

export function extractJsonFromMarkdown(text: string): string | null {
  let match: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(text)) !== null) {
    const block = match[1]?.trim();
    if (block?.startsWith("{")) return block;
  }
  return null;
}

/** Extract first balanced `{ … }` object from arbitrary text. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function repairJsonText(jsonText: string): string {
  return jsonText
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function repairJsonFromText(
  text: string,
  schemaHint?: string,
): JsonRepairOutcome {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "no_json" };

  const candidates = [
    trimmed,
    extractJsonFromMarkdown(trimmed),
    extractJsonObject(trimmed),
    extractJsonObject(trimmed.replace(/^[\s\S]*?(\{)/, "$1")),
  ].filter((c): c is string => Boolean(c?.trim()));

  for (const candidate of candidates) {
    if (tryParseJson(candidate) != null) {
      return { ok: true, json: candidate, method: "direct" };
    }
    const repaired = repairJsonText(candidate);
    if (tryParseJson(repaired) != null) {
      return { ok: true, json: repaired, method: "repaired" };
    }
  }

  const extracted = extractJsonObject(trimmed) ?? extractJsonFromMarkdown(trimmed);
  if (extracted) {
    const repaired = repairJsonText(extracted);
    if (tryParseJson(repaired) != null) {
      return { ok: true, json: repaired, method: "extracted" };
    }
  }

  if (schemaHint) {
    return { ok: false, reason: "no_json" };
  }

  return { ok: false, reason: "no_json" };
}

export function buildJsonSchemaRetryPrompt(
  originalPrompt: string,
  schema: string,
  invalidResponse: string,
): string {
  return `${originalPrompt}

Your previous response was not valid JSON:
---
${invalidResponse.slice(0, 1200)}
---

Return ONLY valid JSON matching this schema (no markdown, no prose):
${schema}`;
}
