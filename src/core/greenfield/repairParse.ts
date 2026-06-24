const PATCH_START = "@@PATCHED_FILE_START@@";
const PATCH_END = "@@PATCHED_FILE_END@@";

export const REPAIR_PARSE_ERROR =
  "Could not find repaired file content in the AI response.";

export const REPAIR_INVALID_FORMAT_USER =
  "Repair model returned an invalid format. Retrying with stricter instructions…";

export const REPAIR_EXHAUSTED_USER =
  "Studio could not automatically repair this TypeScript error. Copy diagnostics.";

export function isRepairParseError(error: string | null | undefined): boolean {
  return /Could not find repaired file|invalid format|PATCH_FORMAT/i.test(error ?? "");
}

export function normalizeRepairPath(raw: string): string {
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
        path: normalizeRepairPath(withClose[1]!),
        contentStart: pos + withClose[0].length,
      });
      continue;
    }
    const linePath = rest.match(/^([^\r\n]+?)\s*(?:\r?\n)/);
    if (linePath) {
      results.push({
        path: normalizeRepairPath(linePath[1]!),
        contentStart: pos + linePath[0].length,
      });
    }
  }

  return results;
}

function findBlockEnd(text: string, contentStart: number, path: string): number {
  const nextFile = nextFileMarkerIndex(text, contentStart + 1);
  const limit = nextFile === -1 ? text.length : nextFile;
  const region = text.slice(contentStart, limit);
  const candidates: number[] = [];

  const pathEndRe = new RegExp(`@@END\\s*:\\s*${escapeRe(path)}(?:\\s*@@)?`, "gi");
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

  if (candidates.length === 0) return -1;
  return Math.min(...candidates);
}

function trimBlockContent(text: string): string {
  return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

export function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^```(?:tsx?|jsx?|typescript|javascript)?\s*\n([\s\S]*?)\n```\s*$/i);
  return m ? m[1]! : trimmed;
}

function parsePatchMarkers(text: string): string | null {
  const start = text.indexOf(PATCH_START);
  const end = text.indexOf(PATCH_END, start + PATCH_START.length);
  if (start === -1 || end === -1) return null;
  const content = trimBlockContent(text.slice(start + PATCH_START.length, end));
  return content.length > 0 ? content : null;
}

function looksLikeSourceFile(text: string, expectedPath: string): boolean {
  if (text.length < 20) return false;
  if (expectedPath.endsWith(".tsx") || expectedPath.endsWith(".jsx")) {
    return (
      /import\s+.+\s+from\s+['"]/.test(text) ||
      /export\s+default/.test(text) ||
      /function\s+[A-Z]/.test(text)
    );
  }
  if (expectedPath.endsWith(".css")) {
    return /[{}:]/.test(text);
  }
  if (expectedPath.endsWith(".json")) {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }
  return /export|import|function|const|interface/.test(text);
}

function parseFileMarkerBlocks(text: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const marker of findFileMarkers(text)) {
    const endIdx = findBlockEnd(text, marker.contentStart, marker.path);
    if (endIdx === -1) continue;
    let content = trimBlockContent(text.slice(marker.contentStart, endIdx));
    content = stripMarkdownCodeFence(content);
    if (content.length === 0) continue;
    byPath.set(marker.path, content);
  }
  return byPath;
}

function resolveExpectedPath(
  byPath: Map<string, string>,
  expectedPath: string,
): string | null {
  const norm = normalizeRepairPath(expectedPath);
  if (byPath.has(norm)) return byPath.get(norm)!;
  for (const [path, content] of byPath) {
    if (path.endsWith(norm) || norm.endsWith(path)) return content;
  }
  if (byPath.size === 1) return [...byPath.values()][0]!;
  return null;
}

/** Apply a single-hunk unified diff when the model returns patch text. */
export function applySimpleUnifiedDiff(original: string, diff: string): string | null {
  if (!/^---\s/m.test(diff) || !/^\+\+\+\s/m.test(diff)) return null;
  const hunkMatch = diff.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!hunkMatch) return null;

  const oldStart = Number(hunkMatch[1]) - 1;
  const oldLines = original.split("\n");
  const hunkLines = diff.split("\n");
  const hunkStart = hunkLines.findIndex((l) => l.startsWith("@@"));
  if (hunkStart === -1) return null;

  const next: string[] = [];
  next.push(...oldLines.slice(0, oldStart));

  for (let i = hunkStart + 1; i < hunkLines.length; i++) {
    const line = hunkLines[i]!;
    if (line.startsWith("--- ") || line.startsWith("+++ ")) break;
    if (line.startsWith("@@")) break;
    if (line.startsWith("+")) next.push(line.slice(1));
    else if (line.startsWith("-")) continue;
    else if (line.startsWith(" ")) next.push(line.slice(1));
    else if (line.length === 0) next.push("");
  }

  let oldIdx = oldStart;
  for (let i = hunkStart + 1; i < hunkLines.length; i++) {
    const line = hunkLines[i]!;
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("@@")) break;
    if (line.startsWith("-")) oldIdx += 1;
    else if (line.startsWith(" ") || line.startsWith("+")) {
      /* accounted in next[] build — skip */
    }
  }
  next.push(...oldLines.slice(oldIdx + (next.length - oldStart)));
  return next.join("\n");
}

export function parseGreenfieldRepairContent(
  raw: string,
  expectedPath: string,
  originalContent?: string,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const byMarker = parseFileMarkerBlocks(trimmed);
  const fromMarkers = resolveExpectedPath(byMarker, expectedPath);
  if (fromMarkers) return fromMarkers;

  const fromPatch = parsePatchMarkers(trimmed);
  if (fromPatch && looksLikeSourceFile(fromPatch, expectedPath)) return fromPatch;

  const fenced = stripMarkdownCodeFence(trimmed);
  if (fenced !== trimmed && looksLikeSourceFile(fenced, expectedPath)) return fenced;

  if (originalContent && trimmed.includes("@@")) {
    const diffApplied = applySimpleUnifiedDiff(originalContent, trimmed);
    if (diffApplied && diffApplied !== originalContent) return diffApplied;
  }

  if (looksLikeSourceFile(trimmed, expectedPath) && !trimmed.includes("@@FILE")) {
    return trimmed;
  }

  return null;
}
