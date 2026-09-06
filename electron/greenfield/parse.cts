import { GREENFIELD_PATHS, type GreenfieldPath } from "./paths.cjs";

const REQUIRED_SET = new Set<string>(GREENFIELD_PATHS);

export const GREENFIELD_MISSING_REQUIRED_FILES =
  "GREENFIELD_MISSING_REQUIRED_FILES" as const;
export const GREENFIELD_UNEXPECTED_FILE_PATHS =
  "GREENFIELD_UNEXPECTED_FILE_PATHS" as const;
export const GREENFIELD_INCOMPLETE_PARSE = "GREENFIELD_INCOMPLETE_PARSE" as const;

export type GreenfieldParseErrorCode =
  | typeof GREENFIELD_MISSING_REQUIRED_FILES
  | typeof GREENFIELD_UNEXPECTED_FILE_PATHS
  | typeof GREENFIELD_INCOMPLETE_PARSE;

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
  errorCode?: GreenfieldParseErrorCode;
  errorCodes?: readonly GreenfieldParseErrorCode[];
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

function formatParseError(diagnostics: GreenfieldParseDiagnostics): {
  message: string;
  errorCode: GreenfieldParseErrorCode;
  errorCodes: GreenfieldParseErrorCode[];
} {
  const parsed = diagnostics.parsedFiles.length;
  const expected = GREENFIELD_PATHS.length;
  const codes: GreenfieldParseErrorCode[] = [];
  const parts: string[] = [];

  const incomplete =
    parsed < expected || diagnostics.missingFiles.length > 0;
  if (incomplete) {
    codes.push(GREENFIELD_INCOMPLETE_PARSE);
    parts.push(
      `Greenfield parse incomplete: parsed ${parsed}/${expected} expected files. Missing: [${diagnostics.missingFiles.join(", ")}].`,
    );
  }
  if (diagnostics.missingFiles.length > 0) {
    codes.push(GREENFIELD_MISSING_REQUIRED_FILES);
    parts.push(
      `Missing required files: ${diagnostics.missingFiles.join(", ")}`,
    );
  }
  if (diagnostics.unexpectedFiles.length > 0) {
    codes.push(GREENFIELD_UNEXPECTED_FILE_PATHS);
    const unexpected = `Unexpected file paths: ${diagnostics.unexpectedFiles.join(", ")}`;
    parts.push(
      incomplete
        ? unexpected
        : `${unexpected}. parsed ${parsed}/${expected} expected files`,
    );
  }

  const errorCode: GreenfieldParseErrorCode =
    diagnostics.unexpectedFiles.length > 0 && diagnostics.missingFiles.length === 0
      ? GREENFIELD_UNEXPECTED_FILE_PATHS
      : parsed > 0 && diagnostics.missingFiles.length > 0
        ? GREENFIELD_INCOMPLETE_PARSE
        : diagnostics.missingFiles.length > 0
          ? GREENFIELD_MISSING_REQUIRED_FILES
          : diagnostics.unexpectedFiles.length > 0
            ? GREENFIELD_UNEXPECTED_FILE_PATHS
            : GREENFIELD_INCOMPLETE_PARSE;

  if (parts.length > 0) {
    return { message: parts.join(". "), errorCode, errorCodes: codes };
  }
  return {
    message: `Greenfield parse incomplete: parsed ${parsed}/${expected} expected files.`,
    errorCode: GREENFIELD_INCOMPLETE_PARSE,
    errorCodes: [GREENFIELD_INCOMPLETE_PARSE],
  };
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

  const parseError = formatParseError(diagnostics);
  return {
    ok: false,
    partialFiles,
    diagnostics,
    errorMessage: parseError.message,
    errorCode: parseError.errorCode,
    errorCodes: parseError.errorCodes,
  };
}

/** Legacy entry — returns files only when parse fully succeeds. */
export function parseGreenfieldResponse(text: string): GeneratedFile[] | null {
  const result = parseGreenfieldResponseDetailed(text);
  return result.ok && result.files ? result.files : null;
}
