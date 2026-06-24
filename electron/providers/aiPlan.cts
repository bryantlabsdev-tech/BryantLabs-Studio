/**
 * AI planning prompt construction + response parsing (Phase 7.5).
 *
 * The model is asked to return a strict JSON plan describing likely-affected
 * files, reasoning, risks, and confidence. It is explicitly instructed NOT to
 * produce code, diffs, or file edits — this stays read-only.
 */

export interface PlanContext {
  framework: string;
  language: string;
  bundler?: string;
  packageManager: string;
  totalFiles: number;
  totalFolders: number;
  entryPoints: string[];
  repositorySummary?: string;
  dependencies?: {
    name: string;
    version: string;
    kind: "dependencies" | "devDependencies" | "peerDependencies";
  }[];
  projectMemory?: {
    projectName: string;
    architecture: string;
    userPreferences: string;
    notes: string;
  };
  files: string[];
  symbolIntelligenceSummary?: string;
  symbols: { name: string; kind: string; path: string; line?: number }[];
  repositoryPrompt?: string;
  relevantFiles?: {
    path: string;
    score: number;
    reasons: string[];
  }[];
  relevantSymbols?: {
    name: string;
    kind: string;
    path: string;
    line?: number;
    reason: string;
  }[];
  referenceGraph?: {
    symbol: string;
    definedIn: string;
    referencedBy: string[];
  }[];
  fileSelection?: {
    reasoning: string;
    intent: {
      features: string[];
      components: string[];
      screens: string[];
      functions: string[];
      keywords: string[];
      uiElements: string[];
      businessConcepts: string[];
    };
    selectedFiles: {
      path: string;
      score: number;
      primaryReason: string;
      reasons: string[];
    }[];
  };
  sessionMemory?: {
    branch: string | null;
    recentPrompts: string[];
    recentPlans: {
      source: "deterministic" | "ai";
      prompt: string;
      summary: string;
      files: string[];
    }[];
    recentModifiedFiles: string[];
    recentFailures: string[];
    recentAutoFixes: { summary: string; files: string[] }[];
    followUpResolution?: {
      rawPrompt: string;
      effectivePrompt: string;
      inferredSubject: string | null;
      reason: string;
    };
  };
  projectIntelligenceSummary?: string;
}

export interface AIPlanFile {
  path: string;
  reason: string;
}

export interface AIPlan {
  summary: string;
  files: AIPlanFile[];
  reasoning: string;
  risks: string[];
  confidence: "High" | "Medium" | "Low";
}

export const AI_PLAN_EXPECTED_SCHEMA = `{
  "summary": "<non-empty string>",
  "files": [
    { "path": "<string>", "reason": "<string>" }
  ],
  "reasoning": "<string>",
  "risks": ["<string>"],
  "confidence": "High" | "Medium" | "Low"
}`;

export type ParseFailReason =
  | "truncated"
  | "json_syntax"
  | "schema_validation"
  | "no_json"
  | "empty_response";

export const AI_PLAN_REQUIRED_ROOT_KEYS = [
  "summary",
  "files",
  "reasoning",
  "risks",
  "confidence",
] as const;

export type JsonTruncationKind =
  | "unclosed_string"
  | "unclosed_brace"
  | "unclosed_bracket"
  | "unexpected_eof";

export interface JsonTruncationDiagnostics {
  truncated: boolean;
  kind?: JsonTruncationKind;
  detail?: string;
}

export interface AIPlanTelemetry {
  parse_fail_reason: ParseFailReason | "none";
  truncation_detected: boolean;
  retry_success: boolean;
  retried: boolean;
  repair_attempted: boolean;
  repair_success: boolean;
}

export function parseFailDisplayTitle(reason: ParseFailReason): string {
  switch (reason) {
    case "truncated":
      return "Response Truncated";
    case "schema_validation":
      return "Schema Validation Failed";
    case "json_syntax":
      return "Invalid JSON";
    case "no_json":
      return "No JSON Returned";
    case "empty_response":
      return "Empty Provider Response";
  }
}

export type ParseAIPlanOutcome =
  | { ok: true; plan: AIPlan }
  | {
      ok: false;
      error: string;
      parseError: string;
      parseFailReason: ParseFailReason;
      truncationDetected: boolean;
    };

export const PLAN_GENERATE_MAX_TOKENS = 8192;
export const PLAN_RETRY_MAX_TOKENS = 16384;
export const PLAN_RETRY_TEMPERATURE = 0.15;

export function buildPlanPrompt(userPrompt: string, context: PlanContext): string {
  const ctx = JSON.stringify(context, null, 2);
  return [
    "You are a senior software engineer analysing a codebase to PLAN a change.",
    "You must NOT write code, diffs, or edits. Produce a read-only analysis only.",
    "",
    "CRITICAL OUTPUT RULES (violations invalidate the response):",
    "- Output JSON ONLY — a single JSON object.",
    "- Do NOT use markdown.",
    "- Do NOT use code fences (no ``` anywhere).",
    "- Do NOT include prose, explanations, or commentary before or after the JSON.",
    "- Do NOT wrap the JSON in an array or any other structure.",
    "- The first non-whitespace character of your reply MUST be {",
    "- The last non-whitespace character of your reply MUST be }",
    "- Your entire response must be parseable by JSON.parse() with no preprocessing.",
    "",
    "Respond with ONLY one JSON object matching exactly this shape:",
    AI_PLAN_EXPECTED_SCHEMA,
    "",
    "Field rules:",
    "- `files` must reference paths from the provided project file list when possible.",
    "- Prefer paths listed under `relevantFiles` and symbols in `relevantSymbols` when present.",
    "- When `fileSelection` is present, prioritize `selectedFiles` (highest score first) and follow `reasoning`.",
    "- Use `referenceGraph` to include files that reference the symbols you change.",
    "- Rank `files` from most to least likely to be affected (max 8).",
    "- Do not select package.json, vite.config, or tsconfig unless the user explicitly asks for tooling changes.",
    "- When `sessionMemory` is present, treat follow-up prompts (it/that/history/etc.) using recentPrompts, recentPlans, and recentModifiedFiles.",
    "- Prefer continuing work on subjects from session memory (e.g. calculator, history panel) without asking the user to repeat context.",
    "- Use `repositorySummary`, `symbolIntelligenceSummary`, `bundler`, and `dependencies` to respect the project's stack.",
    "- Prefer `relevantSymbols` and `relevantFiles` (with line numbers when present) for targeting.",
    "- When `projectMemory` is present, follow architecture notes, userPreferences, and notes.",
    "- When `retrievedMemories` is present, treat them as long-term project knowledge ranked by relevance.",
    "- `risks` lists concerns or side effects; use [] if none.",
    "- `summary` must be non-empty.",
    "- Do not include any keys other than: summary, files, reasoning, risks, confidence.",
    "",
    "User request:",
    userPrompt,
    "",
    "Project context (JSON):",
    ctx,
    "",
    "Reply with the JSON object only.",
  ].join("\n");
}

/** Stricter prompt for automatic retry after truncated output. */
export function buildPlanRetryPrompt(
  userPrompt: string,
  context: PlanContext,
): string {
  const ctx = JSON.stringify(context, null, 2);
  return [
    "You are a senior software engineer analysing a codebase to PLAN a change.",
    "Your previous reply was CUT OFF before the JSON object finished.",
    "",
    "CRITICAL — complete a valid JSON object in one reply:",
    "- Output JSON ONLY. No markdown. No code fences. No prose.",
    "- Keep strings SHORT. Max 8 files. Brief reasons.",
    "- MUST end with a closing } for the root object.",
    "- First character: {  Last character: }",
    "",
    "Required shape (all keys required):",
    AI_PLAN_EXPECTED_SCHEMA,
    "",
    "User request:",
    userPrompt,
    "",
    "Project context (JSON):",
    ctx,
  ].join("\n");
}

/** Ask the model to fix a malformed plan JSON (schema repair pass). */
export function buildPlanSchemaRepairPrompt(malformedResponse: string): string {
  const clipped = malformedResponse.trim().slice(0, 12_000);
  return [
    "Return ONLY valid JSON matching this exact schema.",
    "No markdown. No prose. No code fences.",
    "",
    "Required root keys (all must be present):",
    AI_PLAN_REQUIRED_ROOT_KEYS.join(", "),
    "",
    "Exact schema:",
    AI_PLAN_EXPECTED_SCHEMA,
    "",
    "Your previous reply did not match the schema:",
    clipped,
    "",
    "Reply with one corrected JSON object only.",
  ].join("\n");
}

/** Single repair pass when the model returned prose or non-JSON instead of a plan object. */
export function buildPlanJsonRepairPrompt(previousResponse: string): string {
  const clipped = previousResponse.trim().slice(0, 12_000);
  return [
    "Convert the previous response into valid JSON only.",
    "Return no markdown.",
    "No code fences. No prose. No explanation.",
    "",
    "The response must be one JSON object matching this exact schema:",
    AI_PLAN_EXPECTED_SCHEMA,
    "",
    "Previous response:",
    clipped,
    "",
    "Reply with a single JSON object only. First character must be { and last must be }.",
  ].join("\n");
}

/** Verify required root keys exist before field-type validation. */
export function enforcePlanSchemaKeys(
  data: unknown,
): { ok: true } | { ok: false; missing: string[] } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, missing: [...AI_PLAN_REQUIRED_ROOT_KEYS] };
  }
  const obj = data as Record<string, unknown>;
  const missing = AI_PLAN_REQUIRED_ROOT_KEYS.filter((key) => !(key in obj));
  return missing.length > 0 ? { ok: false, missing: [...missing] } : { ok: true };
}

function clampConfidence(value: unknown): "High" | "Medium" | "Low" {
  if (value === "High" || value === "Medium" || value === "Low") return value;
  return "Medium";
}

/** Strip BOM, markdown fences, and surrounding whitespace from model text. */
export function normalizeModelText(text: string): string {
  let t = text.trim().replace(/^\uFEFF/, "");

  const fullFence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/im.exec(t);
  if (fullFence) return fullFence[1]!.trim();

  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*\n?/i, "");
    t = t.replace(/\n?```\s*$/i, "");
  }

  const inlineFence = t.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (inlineFence) return inlineFence[1]!.trim();

  return t.trim();
}

/** Remove trailing commas before `}` or `]`. */
export function repairJsonText(jsonText: string): string {
  return jsonText.replace(/,\s*([}\]])/g, "$1");
}

interface JsonScanState {
  complete: boolean;
  extracted: string | null;
  inString: boolean;
  braceDepth: number;
  bracketDepth: number;
}

function scanJsonObject(text: string): JsonScanState {
  const normalized = normalizeModelText(text);
  const start = normalized.indexOf("{");
  if (start === -1) {
    return {
      complete: false,
      extracted: null,
      inString: false,
      braceDepth: 0,
      bracketDepth: 0,
    };
  }

  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") braceDepth++;
    else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0 && bracketDepth === 0) {
        return {
          complete: true,
          extracted: normalized.slice(start, i + 1),
          inString: false,
          braceDepth: 0,
          bracketDepth: 0,
        };
      }
    } else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
  }

  return {
    complete: false,
    extracted: null,
    inString,
    braceDepth,
    bracketDepth,
  };
}

/** Detect incomplete JSON (cut-off model output). */
export function detectJsonTruncation(text: string): JsonTruncationDiagnostics {
  const normalized = normalizeModelText(text);
  if (!normalized.includes("{")) return { truncated: false };

  const state = scanJsonObject(text);
  if (state.complete) return { truncated: false };

  if (state.inString) {
    return {
      truncated: true,
      kind: "unclosed_string",
      detail: "Missing closing quote in a string value.",
    };
  }
  if (state.bracketDepth > 0) {
    return {
      truncated: true,
      kind: "unclosed_bracket",
      detail: `Missing ${state.bracketDepth} closing bracket(s).`,
    };
  }
  if (state.braceDepth > 0) {
    return {
      truncated: true,
      kind: "unclosed_brace",
      detail: `Missing ${state.braceDepth} closing brace(s).`,
    };
  }

  return {
    truncated: true,
    kind: "unexpected_eof",
    detail: "Unexpected end of output before the JSON object finished.",
  };
}

function isUnexpectedEofError(message: string): boolean {
  return /unexpected end of json input/i.test(message);
}

/** Extract the first balanced JSON object from arbitrary model text. */
export function extractJsonObject(text: string): string | null {
  return scanJsonObject(text).extracted;
}

function buildTruncatedFailure(
  trunc: JsonTruncationDiagnostics,
): Extract<ParseAIPlanOutcome, { ok: false }> {
  const detail = trunc.detail ?? "The JSON object was not completed.";
  return {
    ok: false,
    error: "Response Truncated",
    parseError: `The AI stopped before completing a valid JSON object. ${detail}`,
    parseFailReason: "truncated",
    truncationDetected: true,
  };
}

function buildParseFailure(
  parseFailReason: ParseFailReason,
  parseError: string,
  truncationDetected: boolean,
): Extract<ParseAIPlanOutcome, { ok: false }> {
  return {
    ok: false,
    error: parseFailDisplayTitle(parseFailReason),
    parseError,
    parseFailReason,
    truncationDetected,
  };
}

function jsonCandidates(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  const normalized = normalizeModelText(text);
  push(normalized);
  push(extractJsonObject(text));
  push(extractJsonObject(normalized));
  if (normalized.trim().startsWith("{")) push(normalized.trim());

  return out;
}

function validateAIPlanObject(
  data: unknown,
): { ok: true; plan: AIPlan } | { ok: false; error: string } {
  const keyCheck = enforcePlanSchemaKeys(data);
  if (!keyCheck.ok) {
    return {
      ok: false,
      error: `Missing required root keys: ${keyCheck.missing.join(", ")}`,
    };
  }

  const obj = data as Record<string, unknown>;
  const invalid: string[] = [];
  if (typeof obj.summary !== "string") invalid.push("summary");
  if (!Array.isArray(obj.files)) invalid.push("files");
  if (typeof obj.reasoning !== "string") invalid.push("reasoning");
  if (!Array.isArray(obj.risks)) invalid.push("risks");
  if (
    obj.confidence !== "High" &&
    obj.confidence !== "Medium" &&
    obj.confidence !== "Low"
  ) {
    invalid.push("confidence");
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Invalid types for required fields: ${invalid.join(", ")}`,
    };
  }

  const summary = obj.summary as string;
  const reasoning = obj.reasoning as string;
  const filesRaw = obj.files as unknown[];
  const risksRaw = obj.risks as unknown[];

  if (!summary.trim()) {
    return { ok: false, error: 'Field "summary" must be a non-empty string.' };
  }

  const files: AIPlanFile[] = filesRaw
    .map((f: unknown) => {
      const entry = (f ?? {}) as Record<string, unknown>;
      return {
        path: typeof entry.path === "string" ? entry.path : "",
        reason: typeof entry.reason === "string" ? entry.reason : "",
      };
    })
    .filter((f: AIPlanFile) => f.path.length > 0)
    .slice(0, 8);

  const risks = risksRaw.filter((r): r is string => typeof r === "string");

  return {
    ok: true,
    plan: {
      summary: summary.trim(),
      files,
      reasoning,
      risks,
      confidence: clampConfidence(obj.confidence),
    },
  };
}

/** Parse model text into an AIPlan with repair + validation. */
export function parseAIPlan(text: string): ParseAIPlanOutcome {
  const truncation = detectJsonTruncation(text);
  const candidates = jsonCandidates(text);
  let lastParseError = "No JSON object found in model output.";
  let lastFailReason: ParseFailReason = "no_json";
  let sawSyntaxError = false;

  for (const candidate of candidates) {
    const extracted =
      extractJsonObject(candidate) ??
      (candidate.trim().startsWith("{") ? candidate.trim() : null);
    if (!extracted) continue;

    for (const variant of [extracted, repairJsonText(extracted)]) {
      try {
        const data: unknown = JSON.parse(variant);
        const keyCheck = enforcePlanSchemaKeys(data);
        if (!keyCheck.ok) {
          lastParseError = `Missing required root keys: ${keyCheck.missing.join(", ")}`;
          lastFailReason = "schema_validation";
          continue;
        }
        const validated = validateAIPlanObject(data);
        if (validated.ok) return { ok: true, plan: validated.plan };
        lastParseError = validated.error;
        lastFailReason = "schema_validation";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid JSON syntax.";
        lastParseError = msg;
        if (isUnexpectedEofError(msg)) {
          return buildTruncatedFailure(
            detectJsonTruncation(text).truncated
              ? truncation
              : {
                  truncated: true,
                  kind: "unexpected_eof",
                  detail: msg,
                },
          );
        }
        sawSyntaxError = true;
        lastFailReason = "json_syntax";
      }
    }
  }

  if (truncation.truncated) {
    return buildTruncatedFailure(truncation);
  }

  if (sawSyntaxError) {
    return buildParseFailure("json_syntax", lastParseError, false);
  }

  const rawPreview = text.trim().slice(0, 1000);
  const detail =
    rawPreview.length > 0
      ? `${lastParseError} (raw preview: ${rawPreview}${text.trim().length > 1000 ? "…" : ""})`
      : lastParseError;

  return buildParseFailure(lastFailReason, detail, false);
}
