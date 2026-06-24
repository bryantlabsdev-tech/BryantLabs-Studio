/** Electron copy of Apply Plan @@FILE parser (keep in sync with src/core/planApply/markedFileParse.ts). */

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

export function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1]! : trimmed;
}

export function hasApplyPlanFileMarkers(text: string): boolean {
  return /@@FILE\s*:/i.test(text);
}

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

    if (expectedSet.has(path)) {
      byPath.set(path, content);
    }
  }

  const detectedPaths = [...detectedSet].sort();
  const hasAnyFileMarker = hasApplyPlanFileMarkers(text);
  const missingPaths = normalizedExpected.filter((p) => !byPath.has(p));

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
