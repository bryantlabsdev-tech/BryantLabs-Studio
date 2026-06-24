import { GREENFIELD_PATHS, type GreenfieldPath } from "./paths.cjs";

const REQUIRED_SET = new Set<string>(GREENFIELD_PATHS);

export interface GeneratedFile {
  path: GreenfieldPath;
  content: string;
}

export interface GreenfieldParseDiagnostics {
  detectedFileMarkers: string[];
  detectedEndMarkers: string[];
  parsedFiles: GreenfieldPath[];
  missingFiles: GreenfieldPath[];
  unexpectedFiles: string[];
}

export interface GreenfieldParseResult {
  ok: boolean;
  files?: GeneratedFile[];
  partialFiles?: GeneratedFile[];
  diagnostics: GreenfieldParseDiagnostics;
  errorMessage?: string;
}

/** Normalize a path segment from a marker for comparison. */
export function normalizeGreenfieldPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function isRequiredPath(normalized: string): normalized is GreenfieldPath {
  return REQUIRED_SET.has(normalized);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Scan all @@FILE:…@@ and @@END…@@ tokens for diagnostics. */
export function scanMarkerTokens(text: string): {
  fileMarkers: string[];
  endMarkers: string[];
} {
  const fileMarkers: string[] = [];
  const endMarkers: string[] = [];

  const fileRe = /@@FILE\s*:\s*([^@]+?)\s*@@/g;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(text)) !== null) {
    fileMarkers.push(normalizeGreenfieldPath(m[1]!));
  }

  const endPathRe = /@@END\s*:\s*([^@]+?)\s*@@/g;
  while ((m = endPathRe.exec(text)) !== null) {
    endMarkers.push(`@@END:${normalizeGreenfieldPath(m[1]!)}@@`);
  }

  const genericRe = /@@END\s*@@/g;
  while ((m = genericRe.exec(text)) !== null) {
    const tail = text.slice(m.index, m.index + 12);
    if (/^@@END\s*:/.test(tail)) continue;
    endMarkers.push("@@END@@");
  }

  return { fileMarkers, endMarkers };
}

function nextFileMarkerIndex(text: string, from: number): number {
  const re = /@@FILE\s*:/g;
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? m.index : -1;
}

function findBlockEnd(
  text: string,
  contentStart: number,
  path: string,
): number {
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

function trimContent(text: string): string {
  return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

function formatParseError(diagnostics: GreenfieldParseDiagnostics): string {
  const parsed = diagnostics.parsedFiles.length;
  const expected = GREENFIELD_PATHS.length;
  if (parsed > 0) {
    return `Greenfield parse incomplete: parsed ${parsed}/${expected} expected files. Missing: [${diagnostics.missingFiles.join(", ")}].`;
  }
  const parts: string[] = [];
  if (diagnostics.missingFiles.length > 0) {
    parts.push(
      `Missing required files: ${diagnostics.missingFiles.join(", ")}`,
    );
  }
  if (diagnostics.unexpectedFiles.length > 0) {
    parts.push(
      `Unexpected file paths: ${diagnostics.unexpectedFiles.join(", ")}`,
    );
  }
  if (parts.length > 0) return parts.join(". ");
  return `Greenfield parse incomplete: parsed 0/${expected} expected files.`;
}

export function parseGreenfieldResponseDetailed(
  text: string,
): GreenfieldParseResult {
  const tokenScan = scanMarkerTokens(text);
  const byPath = new Map<GreenfieldPath, string>();
  const unexpectedSet = new Set<string>();

  const fileRe = /@@FILE\s*:\s*([^@]+?)\s*@@/g;
  let match: RegExpExecArray | null;
  while ((match = fileRe.exec(text)) !== null) {
    const rawPath = match[1]!;
    const normalized = normalizeGreenfieldPath(rawPath);
    const contentStart = match.index + match[0].length;

    if (!isRequiredPath(normalized)) {
      unexpectedSet.add(normalized);
      continue;
    }

    const endIdx = findBlockEnd(text, contentStart, normalized);
    if (endIdx === -1) continue;

    const content = trimContent(text.slice(contentStart, endIdx));
    if (content.length === 0) continue;

    byPath.set(normalized, content);
  }

  const parsedFiles = GREENFIELD_PATHS.filter((p) => byPath.has(p));
  const missingFiles = GREENFIELD_PATHS.filter((p) => !byPath.has(p));

  const diagnostics: GreenfieldParseDiagnostics = {
    detectedFileMarkers: tokenScan.fileMarkers,
    detectedEndMarkers: tokenScan.endMarkers,
    parsedFiles,
    missingFiles,
    unexpectedFiles: [...unexpectedSet].sort(),
  };

  if (
    parsedFiles.length === GREENFIELD_PATHS.length &&
    missingFiles.length === 0 &&
    unexpectedSet.size === 0
  ) {
    const files = GREENFIELD_PATHS.map((path) => ({
      path,
      content: byPath.get(path)!,
    }));
    return { ok: true, files, partialFiles: files, diagnostics };
  }

  const partialFiles = parsedFiles.map((path) => ({
    path,
    content: byPath.get(path)!,
  }));

  return {
    ok: false,
    partialFiles,
    diagnostics,
    errorMessage: formatParseError(diagnostics),
  };
}

/** Legacy entry — returns files only when parse fully succeeds. */
export function parseGreenfieldResponse(text: string): GeneratedFile[] | null {
  const result = parseGreenfieldResponseDetailed(text);
  return result.ok && result.files ? result.files : null;
}
