import { extractJsonFromMarkdown, extractJsonObject, repairJsonText } from "@/core/providers/jsonRepair";
import { auditGreenfieldMarkers } from "@/core/greenfield/promptAudit";
import {
  GREENFIELD_FILE_PATHS,
  type GeneratedFile,
  type GreenfieldFilePath,
} from "@/core/greenfield/types";
import { logGreenfieldJsonRepair } from "@/core/greenfield/generateLogging";

const REQUIRED_SET = new Set<string>(GREENFIELD_FILE_PATHS);
const PATH_EXT_RE = /\.(?:tsx?|jsx?|json|html|css|ts)$/i;

export type GreenfieldResponseShape =
  | "empty"
  | "markdown_only"
  | "json_like"
  | "code_fenced"
  | "truncated"
  | "mixed"
  | "canonical_markers";

function markerStart(p: string): string {
  return `@@FILE:${p}@@`;
}

function markerEnd(p: string): string {
  return `@@END:${p}@@`;
}

function trimContent(text: string): string {
  return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

function normalizeGreenfieldPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^`(.+)`$/, "$1");
}

function isRequiredPath(normalized: string): normalized is GreenfieldFilePath {
  return REQUIRED_SET.has(normalized);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapToFiles(byPath: Map<GreenfieldFilePath, string>): GeneratedFile[] {
  return GREENFIELD_FILE_PATHS.filter((p) => byPath.has(p)).map((path) => ({
    path,
    content: byPath.get(path)!,
  }));
}

function buildDiagnostics(
  byPath: Map<GreenfieldFilePath, string>,
  detectedMarkers: string[],
  unexpected: Set<string>,
  malformed: GreenfieldFilePath[] = [],
  recoveredTruncated: GreenfieldFilePath[] = [],
): GreenfieldFlexibleParseDiagnostics {
  const parsedFiles = GREENFIELD_FILE_PATHS.filter((p) => byPath.has(p));
  const missingFiles = GREENFIELD_FILE_PATHS.filter((p) => !byPath.has(p));
  const malformedBlocks = [
    ...new Set([
      ...malformed.filter((p) => !byPath.has(p)),
      ...missingFiles.filter((p) => detectedMarkers.includes(p) && !byPath.has(p)),
    ]),
  ];
  return {
    parsedFiles,
    missingFiles,
    malformedBlocks,
    unexpectedFiles: [...unexpected].sort(),
    detectedFileMarkers: detectedMarkers,
    ...(recoveredTruncated.length > 0
      ? { recoveredTruncatedFiles: recoveredTruncated }
      : {}),
  };
}

function braceImbalance(content: string): number {
  const open = (content.match(/{/g) ?? []).length;
  const close = (content.match(/}/g) ?? []).length;
  return open - close;
}

function tsxLooksLikeAppShell(content: string): boolean {
  return (
    (/export\s+default\s+function\s+\w+/i.test(content) ||
      /export\s+default\s+\w+/i.test(content) ||
      /export\s+function\s+\w+/i.test(content)) &&
    /return\s*\(|<[A-Za-z]/.test(content)
  );
}

/** Close unmatched `)`, `]`, and `}` so truncated provider output can typecheck. */
export function balanceTruncatedJsx(content: string): string {
  let result = content.trimEnd();
  const openParens = (result.match(/\(/g) ?? []).length;
  const closeParens = (result.match(/\)/g) ?? []).length;
  const openBrackets = (result.match(/\[/g) ?? []).length;
  const closeBrackets = (result.match(/]/g) ?? []).length;
  const openBraces = (result.match(/{/g) ?? []).length;
  const closeBraces = (result.match(/}/g) ?? []).length;

  if (closeParens < openParens) {
    result += ")".repeat(openParens - closeParens);
  }
  if (closeBrackets < openBrackets) {
    result += "]".repeat(openBrackets - closeBrackets);
  }
  if (closeBraces < openBraces) {
    result += "}".repeat(openBraces - closeBraces);
  }
  return result;
}

function normalizeRecoveredPartial(path: string, partial: string): string | null {
  const trimmed = partial.trim();
  if (!trimmed) return null;
  if (isRecoverablePartialContent(path, trimmed)) return trimmed;
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
    if (trimmed.length >= 400 && tsxLooksLikeAppShell(trimmed)) {
      const balanced = balanceTruncatedJsx(trimmed);
      if (isRecoverablePartialContent(path, balanced)) return balanced;
    }
    if (
      path === "src/App.tsx" &&
      trimmed.length >= 1500 &&
      tsxLooksLikeAppShell(trimmed)
    ) {
      const balanced = balanceTruncatedJsx(trimmed);
      if (tsxLooksLikeAppShell(balanced)) return balanced;
    }
  }
  return null;
}

export function isRecoverablePartialContent(path: string, content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 30) return false;

  if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
    if (!tsxLooksLikeAppShell(trimmed)) return false;
    const imbalance = braceImbalance(trimmed);
    if (path === "src/App.tsx" && trimmed.length >= 1500) {
      return imbalance <= Math.max(12, Math.ceil(trimmed.length / 4000));
    }
    return imbalance <= 3;
  }

  if (path.endsWith(".css")) {
    return trimmed.includes("{") && trimmed.includes("}");
  }

  if (path.endsWith(".json")) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  return trimmed.length >= 20;
}

/** Best recoverable slice for a path — prefers the longest valid partial across all marker occurrences. */
export function recoverBestMarkerContent(
  text: string,
  path: GreenfieldFilePath,
): string | null {
  const startMarker = markerStart(path);
  let best: string | null = null;
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const startIdx = text.indexOf(startMarker, searchFrom);
    if (startIdx === -1) break;

    const contentStart = startIdx + startMarker.length;
    const endIdx = text.indexOf(markerEnd(path), contentStart);
    const nextFile = endIdx === -1 ? nextFileMarkerIndex(text, contentStart) : -1;
    const sliceEnd =
      endIdx !== -1 ? endIdx : nextFile === -1 ? text.length : nextFile;
    const partial = trimContent(text.slice(contentStart, sliceEnd));
    const recovered = normalizeRecoveredPartial(path, partial);
    if (recovered && (!best || recovered.length > best.length)) {
      best = recovered;
    }
    searchFrom = contentStart + 1;
  }

  return best;
}

export function recoverTruncatedMarkerContent(
  text: string,
  path: GreenfieldFilePath,
): string | null {
  const startMarker = markerStart(path);
  if (!text.includes(startMarker)) return null;

  const startIdx = text.lastIndexOf(startMarker);
  const contentStart = startIdx + startMarker.length;
  const endIdx = text.indexOf(markerEnd(path), contentStart);
  if (endIdx !== -1) return null;

  return recoverBestMarkerContent(text, path);
}

function nextFileMarkerIndex(text: string, from: number): number {
  const re = /@@FILE\s*:/g;
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? m.index : -1;
}

function findBlockEnd(text: string, contentStart: number, path: string): number {
  const nextFile = nextFileMarkerIndex(text, contentStart + 1);
  const limit = nextFile === -1 ? text.length : nextFile;
  const candidates: number[] = [];

  const pathEndRe = new RegExp(`@@END\\s*:\\s*${escapeRe(path)}\\s*@@`, "g");
  pathEndRe.lastIndex = contentStart;
  const pathMatch = pathEndRe.exec(text);
  if (pathMatch && pathMatch.index < limit) {
    candidates.push(pathMatch.index);
  }

  const genericRe = /@@END\s*@@/g;
  genericRe.lastIndex = contentStart;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericRe.exec(text)) !== null) {
    if (genericMatch.index >= limit) break;
    const tail = text.slice(genericMatch.index, genericMatch.index + 12);
    if (/^@@END\s*:/.test(tail)) continue;
    candidates.push(genericMatch.index);
    break;
  }

  if (candidates.length === 0) return -1;
  return Math.min(...candidates);
}

export interface GreenfieldFlexibleParseDiagnostics {
  readonly parsedFiles: GreenfieldFilePath[];
  readonly missingFiles: GreenfieldFilePath[];
  readonly malformedBlocks: GreenfieldFilePath[];
  readonly unexpectedFiles: string[];
  readonly detectedFileMarkers: string[];
  readonly recoveredTruncatedFiles?: readonly GreenfieldFilePath[];
}

export interface GreenfieldParseAttempt {
  readonly pattern: string;
  readonly filesFound: number;
  readonly failureReason: string;
}

export interface GreenfieldMultiFormatParseResult {
  readonly files: GeneratedFile[];
  readonly diagnostics: GreenfieldFlexibleParseDiagnostics;
  readonly patternsAttempted: readonly string[];
  readonly failureReasons: Readonly<Record<string, string>>;
  readonly responseShape: GreenfieldResponseShape;
  readonly bestPattern: string | null;
  readonly attempts: readonly GreenfieldParseAttempt[];
}

function parseCanonicalAtFile(text: string): {
  byPath: Map<GreenfieldFilePath, string>;
  detected: string[];
  unexpected: Set<string>;
  malformed: GreenfieldFilePath[];
  recoveredTruncated: GreenfieldFilePath[];
} {
  const byPath = new Map<GreenfieldFilePath, string>();
  const unexpectedSet = new Set<string>();
  const detectedFileMarkers: string[] = [];
  const malformedBlocks: GreenfieldFilePath[] = [];
  const recoveredTruncated: GreenfieldFilePath[] = [];

  const fileRe = /@@FILE\s*:\s*([^@]+?)\s*@@/g;
  let match: RegExpExecArray | null;
  while ((match = fileRe.exec(text)) !== null) {
    const normalized = normalizeGreenfieldPath(match[1]!);
    detectedFileMarkers.push(normalized);
    const contentStart = match.index + match[0].length;

    if (!isRequiredPath(normalized)) {
      unexpectedSet.add(normalized);
      continue;
    }

    const endIdx = findBlockEnd(text, contentStart, normalized);
    if (endIdx === -1) {
      const nextFile = nextFileMarkerIndex(text, contentStart);
      const isTailBlock = nextFile === -1;
      if (isTailBlock) {
        const partial = trimContent(text.slice(contentStart));
        if (isRecoverablePartialContent(normalized, partial)) {
          byPath.set(normalized, partial);
          recoveredTruncated.push(normalized);
          continue;
        }
      }
      malformedBlocks.push(normalized);
      continue;
    }

    const content = trimContent(text.slice(contentStart, endIdx));
    if (content.length === 0) {
      malformedBlocks.push(normalized);
      continue;
    }

    byPath.set(normalized, content);
  }

  return { byPath, detected: detectedFileMarkers, unexpected: unexpectedSet, malformed: malformedBlocks, recoveredTruncated };
}

/** Format A: —FILE: path— … —END FILE— (also ---FILE:--- variants). */
function parseDashFileBlocks(text: string): Map<GreenfieldFilePath, string> {
  const byPath = new Map<GreenfieldFilePath, string>();
  const startRe = /(?:^|\n)[\-—]{2,3}\s*FILE\s*:\s*([^\n\-—]+?)\s*[\-—]{2,3}\s*\n/g;
  const starts: { path: string; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(text)) !== null) {
    starts.push({ path: m[1]!.trim(), contentStart: m.index + m[0].length });
  }
  for (let i = 0; i < starts.length; i += 1) {
    const { path: rawPath, contentStart } = starts[i]!;
    const nextStart = i + 1 < starts.length ? starts[i + 1]!.contentStart - starts[i + 1]!.path.length : text.length;
    const slice = text.slice(contentStart, nextStart);
    const endMatch = slice.match(/\n[\-—]{2,3}\s*END(?:\s*FILE)?(?:\s*:\s*[^\n]+)?\s*[\-—]{2,3}/i);
    const content = trimContent(endMatch ? slice.slice(0, endMatch.index) : slice);
    const normalized = normalizeGreenfieldPath(rawPath);
    if (isRequiredPath(normalized) && content.length > 0) {
      byPath.set(normalized, content);
    }
  }
  return byPath;
}

/** Format B: FILE: path followed by content until next FILE: line. */
function parseFileColonBlocks(text: string): Map<GreenfieldFilePath, string> {
  const byPath = new Map<GreenfieldFilePath, string>();
  const re = /^FILE:\s*(.+?)\s*\n([\s\S]*?)(?=^FILE:\s|$)/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const normalized = normalizeGreenfieldPath(match[1]!);
    const content = trimContent(match[2] ?? "");
    if (isRequiredPath(normalized) && content.length > 0) {
      byPath.set(normalized, content);
    }
  }
  return byPath;
}

/** Format C: markdown headings like ### `src/App.tsx`. */
function parseMarkdownHeadings(text: string): Map<GreenfieldFilePath, string> {
  const byPath = new Map<GreenfieldFilePath, string>();
  const re = /^#{1,4}\s+`?([^\s`\n]+)`?\s*\n([\s\S]*?)(?=^#{1,4}\s|$)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const normalized = normalizeGreenfieldPath(match[1]!);
    const content = trimContent(match[2] ?? "");
    if (isRequiredPath(normalized) && content.length > 0) {
      byPath.set(normalized, content);
    }
  }
  return byPath;
}

/** Format D: code fences with file= or filename= in the info string. */
function parseCodeFenceWithMeta(text: string): Map<GreenfieldFilePath, string> {
  const byPath = new Map<GreenfieldFilePath, string>();
  const re = /```[^\n]*\b(?:file|filename)=([^\s\n`]+)[^\n]*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const normalized = normalizeGreenfieldPath(match[1]!);
    const content = trimContent(match[2] ?? "");
    if (isRequiredPath(normalized) && content.length > 0) {
      byPath.set(normalized, content);
    }
  }
  return byPath;
}

/** Format E: JSON { "files": [{ "path", "content" }] }. */
function parseJsonFilesArray(text: string): Map<GreenfieldFilePath, string> {
  const byPath = new Map<GreenfieldFilePath, string>();
  const candidates = [
    text.trim(),
    extractJsonFromMarkdown(text) ?? "",
    extractJsonObject(text) ?? "",
    repairJsonText(text),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const files = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { files?: unknown }).files)
          ? (parsed as { files: unknown[] }).files
          : null;
      if (!files) continue;
      for (const entry of files) {
        if (!entry || typeof entry !== "object") continue;
        const path = normalizeGreenfieldPath(
          String((entry as { path?: string; file?: string }).path ?? (entry as { file?: string }).file ?? ""),
        );
        const content = String((entry as { content?: string }).content ?? "");
        if (isRequiredPath(path) && content.trim().length > 0) {
          byPath.set(path, trimContent(content));
        }
      }
      if (byPath.size > 0) break;
    } catch {
      // try next candidate
    }
  }
  return byPath;
}

/** Format F: path on its own line immediately before a code fence. */
function parsePathBeforeFence(text: string): Map<GreenfieldFilePath, string> {
  const byPath = new Map<GreenfieldFilePath, string>();
  const re = /^(`?[\w./-]+\.(?:tsx?|jsx?|json|html|css|ts)`?)\s*\n```[\w.-]*\n([\s\S]*?)```/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const normalized = normalizeGreenfieldPath(match[1]!);
    const content = trimContent(match[2] ?? "");
    if (isRequiredPath(normalized) && content.length > 0) {
      byPath.set(normalized, content);
    }
  }
  return byPath;
}

function classifyResponseShape(text: string): GreenfieldResponseShape {
  const trimmed = text.trim();
  if (!trimmed) return "empty";
  if (/@@FILE\s*:/.test(trimmed)) return "canonical_markers";
  if (/^[\s\S]*\{[\s\S]*"files"\s*:/.test(trimmed) || trimmed.startsWith("{")) {
    return "json_like";
  }
  if (/```/.test(trimmed)) {
    const fenceCount = (trimmed.match(/```/g) ?? []).length;
    if (fenceCount % 2 !== 0) return "truncated";
    return "code_fenced";
  }
  if (/^#{1,4}\s/m.test(trimmed) && !PATH_EXT_RE.test(trimmed)) {
    return "markdown_only";
  }
  if (/@@FILE\s*:/.test(trimmed) && !/@@END/.test(trimmed)) return "truncated";
  return "mixed";
}

type PatternParser = (text: string) => Map<GreenfieldFilePath, string>;

const PATTERN_REGISTRY: readonly { id: string; parse: PatternParser; describe: string }[] = [
  {
    id: "canonical_at_file",
    parse: (t) => parseCanonicalAtFile(t).byPath,
    describe: "@@FILE:path@@ markers",
  },
  { id: "format_a_dash_file", parse: parseDashFileBlocks, describe: "—FILE: path— blocks" },
  { id: "format_b_file_colon", parse: parseFileColonBlocks, describe: "FILE: path blocks" },
  { id: "format_e_json_files", parse: parseJsonFilesArray, describe: "JSON files array" },
  { id: "format_d_code_fence_meta", parse: parseCodeFenceWithMeta, describe: "code fences with file=" },
  { id: "format_c_markdown_heading", parse: parseMarkdownHeadings, describe: "markdown file headings" },
  { id: "format_f_path_before_fence", parse: parsePathBeforeFence, describe: "path line before code fence" },
];

function attemptFailureReason(
  patternId: string,
  filesFound: number,
  shape: GreenfieldResponseShape,
  text: string,
): string {
  if (!text.trim()) return "response was empty";
  if (filesFound > 0) return "matched partial files";
  switch (patternId) {
    case "canonical_at_file":
      if (shape === "canonical_markers") return "markers present but blocks incomplete or empty";
      return "no @@FILE:path@@ markers found";
    case "format_a_dash_file":
      return "no —FILE:— / ---FILE:--- blocks found";
    case "format_b_file_colon":
      return "no FILE: path blocks found";
    case "format_e_json_files":
      if (shape === "json_like") return "JSON-like text present but files array not parseable";
      return "no JSON files array found";
    case "format_d_code_fence_meta":
      if (shape === "code_fenced") return "code fences found but none with file=/filename=";
      return "no code fences with file metadata";
    case "format_c_markdown_heading":
      if (shape === "markdown_only") return "markdown headings found but no recognized file paths";
      return "no markdown file headings found";
    case "format_f_path_before_fence":
      if (shape === "code_fenced") return "code fences found but no path line immediately before fence";
      return "no path-before-fence pattern found";
    default:
      return "pattern did not match";
  }
}

export function parseGreenfieldMultiFormat(text: string): GreenfieldMultiFormatParseResult {
  const responseShape = classifyResponseShape(text);
  const patternsAttempted: string[] = [];
  const failureReasons: Record<string, string> = {};
  const attempts: GreenfieldParseAttempt[] = [];

  let bestByPath = new Map<GreenfieldFilePath, string>();
  let bestPattern: string | null = null;
  let bestDetected: string[] = [];
  let bestUnexpected = new Set<string>();
  let bestMalformed: GreenfieldFilePath[] = [];
  let bestRecoveredTruncated: GreenfieldFilePath[] = [];

  for (const { id, parse, describe } of PATTERN_REGISTRY) {
    patternsAttempted.push(id);
    const byPath = parse(text);
    const filesFound = byPath.size;
    const failureReason = attemptFailureReason(id, filesFound, responseShape, text);
    failureReasons[id] = failureReason;
    attempts.push({ pattern: id, filesFound, failureReason: `${describe}: ${failureReason}` });

    if (filesFound > bestByPath.size) {
      bestByPath = byPath;
      bestPattern = id;
      if (id === "canonical_at_file") {
        const canonical = parseCanonicalAtFile(text);
        bestDetected = canonical.detected;
        bestUnexpected = canonical.unexpected;
        bestMalformed = canonical.malformed;
        bestRecoveredTruncated = canonical.recoveredTruncated;
      } else {
        bestDetected = [...byPath.keys()];
        bestUnexpected = new Set();
        bestMalformed = [];
      }
    }
  }

  const recoveredTruncated: GreenfieldFilePath[] = [...bestRecoveredTruncated];
  for (const path of GREENFIELD_FILE_PATHS) {
    if (bestByPath.has(path)) continue;
    const recovered = recoverBestMarkerContent(text, path);
    if (recovered) {
      bestByPath.set(path, recovered);
      recoveredTruncated.push(path);
    }
  }
  const filesAfterRecovery = mapToFiles(bestByPath);
  const diagnostics = buildDiagnostics(
    bestByPath,
    bestDetected,
    bestUnexpected,
    bestMalformed,
    recoveredTruncated,
  );

  return {
    files: filesAfterRecovery,
    diagnostics,
    patternsAttempted,
    failureReasons,
    responseShape,
    bestPattern,
    attempts,
  };
}

export function parseGreenfieldFlexible(text: string): {
  readonly files: GeneratedFile[];
  readonly diagnostics: GreenfieldFlexibleParseDiagnostics;
} {
  const multi = parseGreenfieldMultiFormat(text);
  return { files: multi.files, diagnostics: multi.diagnostics };
}

export function parseGreenfieldFileMarkers(text: string): GeneratedFile[] | null {
  const { files, diagnostics } = parseGreenfieldFlexible(text);
  if (
    files.length === GREENFIELD_FILE_PATHS.length &&
    diagnostics.missingFiles.length === 0
  ) {
    return files;
  }
  return null;
}

/** Parse whatever required files are present (partial generation). */
export function parseGreenfieldPartial(text: string): GeneratedFile[] {
  return parseGreenfieldFlexible(text).files;
}

export function mergeGeneratedFiles(
  base: readonly GeneratedFile[],
  incoming: readonly GeneratedFile[],
): GeneratedFile[] {
  const map = new Map<GreenfieldFilePath, string>();
  for (const f of base) map.set(f.path, f.content);
  for (const f of incoming) map.set(f.path, f.content);
  return GREENFIELD_FILE_PATHS.filter((p) => map.has(p)).map((path) => ({
    path,
    content: map.get(path)!,
  }));
}

export interface GreenfieldParseOutcome {
  readonly files: GeneratedFile[] | null;
  readonly partial: GeneratedFile[];
  readonly markerAudit: ReturnType<typeof auditGreenfieldMarkers>;
  readonly repairMethod?: string;
  readonly diagnostics: GreenfieldFlexibleParseDiagnostics;
  readonly patternsAttempted: readonly string[];
  readonly failureReasons: Readonly<Record<string, string>>;
  readonly responseShape: GreenfieldResponseShape;
  readonly bestPattern: string | null;
  readonly rawResponseLength: number;
  readonly rawResponsePreview: string;
}

const RAW_PREVIEW_CHARS = 2000;

/** Parse response with multi-format attempts and markdown/JSON normalization. */
export function parseGreenfieldWithRepair(
  rawText: string,
  promptSent = "",
): GreenfieldParseOutcome {
  const markerAudit = auditGreenfieldMarkers(rawText, promptSent);
  let repairMethod: string | undefined;

  let multi = parseGreenfieldMultiFormat(rawText);
  if (multi.files.length === GREENFIELD_FILE_PATHS.length) {
    return buildParseOutcome(multi, markerAudit, rawText, repairMethod);
  }

  const candidates = [
    { text: extractJsonFromMarkdown(rawText) ?? "", method: "json_fence_extract" },
    { text: repairJsonText(rawText), method: "json_repair" },
  ].filter((c) => c.text && c.text !== rawText);

  for (const candidate of candidates) {
    const parsed = parseGreenfieldMultiFormat(candidate.text);
    if (parsed.files.length > multi.files.length) {
      multi = parsed;
      repairMethod = candidate.method;
    }
    if (parsed.files.length === GREENFIELD_FILE_PATHS.length) {
      logGreenfieldJsonRepair({
        ok: true,
        method: repairMethod ?? candidate.method,
        recoveredFiles: parsed.files.length,
      });
      return buildParseOutcome(parsed, markerAudit, rawText, repairMethod ?? candidate.method);
    }
  }

  if (multi.files.length > 0) {
    logGreenfieldJsonRepair({
      ok: false,
      method: repairMethod ?? "partial_multi_format",
      recoveredFiles: multi.files.length,
    });
  }

  return buildParseOutcome(multi, markerAudit, rawText, repairMethod);
}

function buildParseOutcome(
  multi: GreenfieldMultiFormatParseResult,
  markerAudit: ReturnType<typeof auditGreenfieldMarkers>,
  rawText: string,
  repairMethod?: string,
): GreenfieldParseOutcome {
  return {
    files:
      multi.files.length === GREENFIELD_FILE_PATHS.length ? multi.files : null,
    partial: multi.files,
    markerAudit,
    diagnostics: multi.diagnostics,
    patternsAttempted: multi.patternsAttempted,
    failureReasons: multi.failureReasons,
    responseShape: multi.responseShape,
    bestPattern: multi.bestPattern,
    rawResponseLength: rawText.length,
    rawResponsePreview: rawText.slice(0, RAW_PREVIEW_CHARS),
    ...(repairMethod ? { repairMethod } : {}),
  };
}

export function buildMalformedResponseRepairPrompt(
  originalPrompt: string,
  rawResponse: string,
  missingFiles: readonly GreenfieldFilePath[],
  existing: readonly GeneratedFile[],
): string {
  const existingBlock =
    existing.length > 0
      ? existing
          .map((f) => `${markerStart(f.path)}\n${f.content}\n${markerEnd(f.path)}`)
          .join("\n\n")
      : "(none)";

  const preview =
    rawResponse.length > 12_000
      ? `${rawResponse.slice(0, 8_000)}\n\n… [truncated] …\n\n${rawResponse.slice(-2_000)}`
      : rawResponse;

  return [
    "The previous greenfield response was malformed or incomplete.",
    "Convert it into valid @@FILE:path@@ … @@END:path@@ blocks for every missing file.",
    `Missing files: ${missingFiles.join(", ")}`,
    "",
    "Already parsed correctly (keep unchanged unless fixing references):",
    existingBlock,
    "",
    "Malformed prior response (repair into valid markers only):",
    preview,
    "",
    "Original user request:",
    originalPrompt,
  ].join("\n");
}

export function buildMissingFilesPrompt(
  originalPrompt: string,
  missingFiles: readonly GreenfieldFilePath[],
  existing: readonly GeneratedFile[],
): string {
  const existingBlock = buildCompactExistingFilesReference(existing);

  return [
    "The previous greenfield response was incomplete or invalid.",
    `Return ONLY the missing files using @@FILE:path@@ … @@END:path@@ markers.`,
    `Missing files: ${missingFiles.join(", ")}`,
    "",
    "Already generated (reference only — do NOT re-emit these files):",
    existingBlock,
    "",
    "Original user request:",
    originalPrompt,
  ].join("\n");
}

const COMPACT_CSS_NOTE =
  "src/index.css: full layout/component styles already generated — reuse classes (.app-layout, .sidebar, .kpi-card, .table, .button, .badge, etc.); do NOT regenerate CSS.";

export function buildCompactExistingFilesReference(
  existing: readonly GeneratedFile[],
): string {
  if (existing.length === 0) return "(none)";
  return existing
    .map((file) => {
      if (file.path === "src/index.css") return COMPACT_CSS_NOTE;
      if (file.path === "package.json") {
        try {
          const pkg = JSON.parse(file.content) as { dependencies?: Record<string, string> };
          const deps = Object.keys(pkg.dependencies ?? {}).join(", ") || "react, react-dom";
          return `package.json: dependencies (${deps})`;
        } catch {
          return "package.json: (valid JSON project manifest)";
        }
      }
      const lines = file.content.split("\n");
      const preview = lines.slice(0, 8).join("\n");
      const suffix = lines.length > 8 ? `\n… (${lines.length} lines total)` : "";
      return `${file.path}:\n${preview}${suffix}`;
    })
    .join("\n\n");
}

/** Lean prompt for a reserved-budget completion call when only App.tsx (or other critical paths) remain. */
export function buildLeanCriticalFilePrompt(
  originalPrompt: string,
  missingFiles: readonly GreenfieldFilePath[],
  existing: readonly GeneratedFile[],
): string {
  const existingBlock = buildCompactExistingFilesReference(existing);
  const promptSummary =
    originalPrompt.length > 2500
      ? `${originalPrompt.slice(0, 2200).trim()}…`
      : originalPrompt;

  return [
    "Greenfield generation truncated before completing the app entry file.",
    `Return ONLY these file(s) as complete @@FILE:path@@ … @@END:path@@ blocks:`,
    missingFiles.join(", "),
    "",
    "Requirements:",
    "- Use the existing CSS class names from src/index.css (sidebar, app-layout, kpi-card, table, button, badge, etc.).",
    "- Implement the pages/routes/features from the user request in src/App.tsx.",
    "- Use only dependencies already declared in package.json unless the user explicitly required more.",
    "- Do NOT repeat package.json, index.html, main.tsx, tsconfig, vite.config, or index.css.",
    "",
    "Existing project context (reference only):",
    existingBlock,
    "",
    "User request (summary):",
    promptSummary,
  ].join("\n");
}
