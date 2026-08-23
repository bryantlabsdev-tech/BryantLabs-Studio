/**
 * Parse @@FILE:path … @@END blocks from Apply Plan model output.
 * Accepts @@FILE:path@@ or @@FILE:path newline; @@END, @@END:path, with optional @@.
 */

export const APPLY_PLAN_PATCH_FORMAT_ERROR = "PATCH_FORMAT_ERROR";

export type ApplyPlanParseErrorCode =
  | typeof APPLY_PLAN_PATCH_FORMAT_ERROR
  | "MISSING_FILES"
  | "EMPTY_FILE";

export interface ApplyPlanMarkedParseResult {
  readonly ok: boolean;
  readonly files: ReadonlyMap<string, string>;
  readonly missingPaths: readonly string[];
  readonly detectedPaths: readonly string[];
  readonly hasAnyFileMarker: boolean;
  readonly errorCode?: ApplyPlanParseErrorCode;
  readonly errorMessage?: string;
}

export function normalizeApplyPlanPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextFileMarkerIndex(text: string, from: number): number {
  const re = /@@FILE\s*:/gi;
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? m.index : -1;
}

interface FileMarkerMatch {
  readonly path: string;
  readonly contentStart: number;
}

/** Locate @@FILE blocks (strict @@ close or newline-terminated path). */
function findFileMarkers(text: string): FileMarkerMatch[] {
  const results: FileMarkerMatch[] = [];
  const startRe = /@@FILE\s*:/gi;
  let m: RegExpExecArray | null;

  while ((m = startRe.exec(text)) !== null) {
    const pos = m.index + m[0].length;
    const rest = text.slice(pos);
    const withClose = rest.match(/^([^\n@]+?)\s*@@/);
    if (withClose) {
      results.push({
        path: normalizeApplyPlanPath(withClose[1]!),
        contentStart: pos + withClose[0].length,
      });
      continue;
    }
    const linePath = rest.match(/^([^\r\n]+?)\s*(?:\r?\n)/);
    if (linePath) {
      results.push({
        path: normalizeApplyPlanPath(linePath[1]!),
        contentStart: pos + linePath[0].length,
      });
    }
  }

  return results;
}

function findBlockEnd(
  text: string,
  contentStart: number,
  path: string,
): number {
  const nextFile = nextFileMarkerIndex(text, contentStart + 1);
  const limit = nextFile === -1 ? text.length : nextFile;
  const region = text.slice(contentStart, limit);
  const candidates: number[] = [];

  const pathEndRe = new RegExp(
    `@@END\\s*:\\s*${escapeRe(path)}(?:\\s*@@)?`,
    "gi",
  );
  let em: RegExpExecArray | null;
  while ((em = pathEndRe.exec(region)) !== null) {
    candidates.push(contentStart + em.index);
  }

  const genericClose = /@@END\s*@@/gi;
  while ((em = genericClose.exec(region)) !== null) {
    const tail = region.slice(em.index, em.index + 12);
    if (/^@@END\s*:/i.test(tail)) continue;
    candidates.push(contentStart + em.index);
    break;
  }

  const bareLine = /(?:^|\n)@@END\s*(?:@@)?(?=\s*(?:\r?\n|$))/gi;
  while ((em = bareLine.exec(region)) !== null) {
    candidates.push(contentStart + em.index);
    break;
  }

  if (candidates.length === 0) return -1;
  return Math.min(...candidates);
}

function trimBlockContent(text: string): string {
  return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

/** Strip a single markdown code fence wrapper if the model ignored instructions. */
export function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1]! : trimmed;
}

interface FencedBlock {
  readonly info: string;
  readonly body: string;
  readonly start: number;
}

function extractFencedBlocks(text: string): FencedBlock[] {
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  const blocks: FencedBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const body = match[2]?.trim() ?? "";
    if (!body) continue;
    blocks.push({
      info: (match[1] ?? "").trim(),
      body,
      start: match.index,
    });
  }
  return blocks;
}

/** Largest fenced code block when the model returns markdown instead of @@FILE markers. */
export function extractLargestFencedCodeBlock(text: string): string | null {
  let best: string | null = null;
  let bestLen = 0;
  for (const block of extractFencedBlocks(text)) {
    if (block.body.length > bestLen) {
      bestLen = block.body.length;
      best = block.body;
    }
  }
  return best;
}

function looksLikeSourceFile(content: string, path: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 24) return false;
  if (/\.tsx?$/i.test(path)) {
    return /^(import |export |\/\/|\/\*|function |const |type |interface )/m.test(
      trimmed,
    );
  }
  if (/\.css$/i.test(path)) {
    return /[{}:;]/.test(trimmed);
  }
  return trimmed.length > 40;
}

function tryRecoverSingleFileFromFence(
  text: string,
  path: string,
): string | null {
  const fenced = extractLargestFencedCodeBlock(text);
  if (fenced && looksLikeSourceFile(fenced, path)) return fenced;
  const whole = stripMarkdownCodeFence(text);
  if (whole !== text.trim() && looksLikeSourceFile(whole, path)) return whole;
  return null;
}

function pathFromFenceInfo(
  info: string,
  expected: ReadonlySet<string>,
): string | null {
  const tokens = info
    .split(/[\s,]+/)
    .map((token) => normalizeApplyPlanPath(token.replace(/^['"`]+|['"`]+$/g, "")))
    .filter(Boolean);
  for (const token of tokens) {
    if (expected.has(token)) return token;
    for (const path of expected) {
      if (path === token || path.endsWith(`/${token}`)) return path;
    }
  }
  return null;
}

function pathFromTextBeforeFence(
  text: string,
  fenceStart: number,
  expected: ReadonlySet<string>,
): string | null {
  const prefix = text.slice(Math.max(0, fenceStart - 240), fenceStart);
  const heading = prefix.match(
    /(?:^|\n)\s*(?:#{1,6}\s+|\*\*|`)?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)(?:\*\*|`)?\s*$/,
  );
  if (!heading) return null;
  const token = normalizeApplyPlanPath(heading[1]!);
  if (expected.has(token)) return token;
  for (const path of expected) {
    if (path === token || path.endsWith(`/${token}`)) return path;
  }
  return null;
}

/** Recover full file bodies from markdown fences when @@FILE markers are missing or incomplete. */
export function recoverFencedApplyPlanFiles(
  text: string,
  expectedPaths: readonly string[],
): Map<string, string> {
  const expected = new Set(expectedPaths.map(normalizeApplyPlanPath));
  const recovered = new Map<string, string>();
  const unmatched: string[] = [];

  for (const block of extractFencedBlocks(text)) {
    const path =
      pathFromFenceInfo(block.info, expected) ??
      pathFromTextBeforeFence(text, block.start, expected);
    if (path && looksLikeSourceFile(block.body, path) && !recovered.has(path)) {
      recovered.set(path, block.body);
      continue;
    }
    unmatched.push(block.body);
  }

  const missing = [...expected].filter((path) => !recovered.has(path));
  if (missing.length === 1) {
    const onlyPath = missing[0]!;
    const candidate =
      unmatched.find((body) => looksLikeSourceFile(body, onlyPath)) ??
      tryRecoverSingleFileFromFence(text, onlyPath);
    if (candidate) recovered.set(onlyPath, candidate);
  }

  return recovered;
}

export function hasApplyPlanFileMarkers(text: string): boolean {
  return /@@FILE\s*:/i.test(text);
}

/**
 * Extract full file bodies for each expected path.
 */
export function parseApplyPlanMarkedFiles(
  text: string,
  expectedPaths: readonly string[],
): ApplyPlanMarkedParseResult {
  const normalizedExpected = expectedPaths.map(normalizeApplyPlanPath);
  const expectedSet = new Set(normalizedExpected);
  const byPath = new Map<string, string>();
  const detectedSet = new Set<string>();

  for (const marker of findFileMarkers(text)) {
    const path = marker.path;
    detectedSet.add(path);
    const endIdx = findBlockEnd(text, marker.contentStart, path);
    if (endIdx === -1) continue;

    let content = trimBlockContent(
      text.slice(marker.contentStart, endIdx),
    );
    content = stripMarkdownCodeFence(content);
    if (content.length === 0) continue;
    if (/^<full(?: updated)? file content>$/i.test(content.trim())) continue;

    if (expectedSet.has(path)) {
      if (/\.(tsx?|jsx?|css)$/i.test(path) && !looksLikeSourceFile(content, path)) {
        continue;
      }
      byPath.set(path, content);
    }
  }

  let detectedPaths = [...detectedSet].sort();
  const hasAnyFileMarker = hasApplyPlanFileMarkers(text);
  let missingPaths = normalizedExpected.filter((p) => !byPath.has(p));

  if (missingPaths.length > 0) {
    const recovered = recoverFencedApplyPlanFiles(text, missingPaths);
    for (const [path, content] of recovered) {
      if (!byPath.has(path)) {
        byPath.set(path, content);
        detectedSet.add(path);
      }
    }
    detectedPaths = [...detectedSet].sort();
    missingPaths = normalizedExpected.filter((p) => !byPath.has(p));
  }

  if (missingPaths.length === 0 && byPath.size > 0) {
    return {
      ok: true,
      files: byPath,
      missingPaths: [],
      detectedPaths,
      hasAnyFileMarker,
    };
  }

  if (!hasAnyFileMarker) {
    return {
      ok: false,
      files: byPath,
      missingPaths,
      detectedPaths,
      hasAnyFileMarker: false,
      errorCode: APPLY_PLAN_PATCH_FORMAT_ERROR,
      errorMessage:
        "Response contained no @@FILE markers. Model must return full file content between @@FILE and @@END only.",
    };
  }

  if (missingPaths.length > 0) {
    return {
      ok: false,
      files: byPath,
      missingPaths,
      detectedPaths,
      hasAnyFileMarker: true,
      errorCode: "MISSING_FILES",
      errorMessage: `Missing file blocks for: ${missingPaths.join(", ")}`,
    };
  }

  return {
    ok: true,
    files: byPath,
    missingPaths: [],
    detectedPaths,
    hasAnyFileMarker: true,
  };
}

export function formatApplyPlanMarkerExample(paths: readonly string[]): string {
  return paths
    .map((p) => `@@FILE:${p}\n<full updated file content>\n@@END`)
    .join("\n\n");
}
