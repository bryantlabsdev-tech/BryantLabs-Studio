import { validatePatch, MAX_EDIT_BYTES } from "@/core/editor/validate";
import { diffLineStats } from "@/core/planApply/stats";
import type { PlanApplyDiffStats } from "@/core/planApply/types";
import type { ProjectScan } from "@/types";

const EXPORT_NAME =
  /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;

function extractExportNames(source: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = EXPORT_NAME.exec(source)) !== null) {
    names.push(match[1]!);
  }
  if (/export\s+default\b/.test(source) && !names.includes("default")) {
    names.push("default");
  }
  return names;
}

/** Reject patches that remove existing exported symbols from a module. */
export function validateProposalPreservesExports(
  before: string,
  after: string,
): ProposalQualityResult | { ok: true } {
  const beforeExports = extractExportNames(before);
  if (beforeExports.length === 0) return { ok: true };
  const afterSet = new Set(extractExportNames(after));
  const removed = beforeExports.filter((name) => !afterSet.has(name));
  if (removed.length === 0) return { ok: true };
  return {
    ok: false,
    reason: `Patch removes exported symbol(s): ${removed.join(", ")}`,
  };
}

export type ProposalQualityResult =
  | { ok: true; stats: PlanApplyDiffStats }
  | { ok: false; reason: string };

/** True when the only differences between before and after are whitespace. */
export function isWhitespaceOnlyChange(before: string, after: string): boolean {
  if (before === after) return false;
  return before.replace(/\s/g, "") === after.replace(/\s/g, "");
}

/**
 * Validate a proposed patch before it enters review.
 * Rejects identical content, whitespace-only edits, and malformed results.
 */
export function validateProposalQuality(
  before: string,
  after: string,
  relPath: string,
  scan?: ProjectScan | null,
): ProposalQualityResult {
  const trimmedPath = relPath.trim();
  if (!trimmedPath || trimmedPath.includes("..")) {
    return { ok: false, reason: `Invalid file target: ${relPath}` };
  }

  const validation = validatePatch(before, after);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason ?? "Invalid patch format." };
  }

  const stats = diffLineStats(before, after);
  if (!stats.changed) {
    return {
      ok: false,
      reason: "Patch produces no changes (identical content).",
    };
  }

  if (isWhitespaceOnlyChange(before, after)) {
    return {
      ok: false,
      reason: "Patch only changes whitespace (no semantic change).",
    };
  }

  const exportCheck = validateProposalPreservesExports(before, after);
  if (!exportCheck.ok) {
    return exportCheck;
  }

  const importCheck = validateProposalRelativeImports(after, scan, relPath);
  if (!importCheck.ok) {
    return importCheck;
  }

  return { ok: true, stats };
}

const RELATIVE_IMPORT =
  /import\s+(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+["'](\.[^"']+)["']/g;

function normalizeRelativeImportPath(baseDir: string, rawImport: string): string {
  const parts = (baseDir ? `${baseDir}/${rawImport}` : rawImport)
    .replace(/\\/g, "/")
    .split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

/** Reject patches that introduce relative imports to paths absent from the project scan. */
export function validateProposalRelativeImports(
  after: string,
  scan: ProjectScan | null | undefined,
  relPath: string,
): ProposalQualityResult | { ok: true } {
  if (!scan?.files.length) return { ok: true };
  const known = new Set(scan.files.map((f) => f.path.replace(/\\/g, "/")));
  const dir = relPath.includes("/") ? relPath.replace(/\/[^/]+$/, "") : "";
  const missing: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = RELATIVE_IMPORT.exec(after)) !== null) {
    const raw = match[1]!;
    const joined = normalizeRelativeImportPath(dir, raw);
    const candidates = [
      joined,
      `${joined}.ts`,
      `${joined}.tsx`,
      `${joined}.js`,
      `${joined}.jsx`,
      `${joined}/index.ts`,
      `${joined}/index.tsx`,
    ];
    if (!candidates.some((c) => known.has(c))) {
      missing.push(raw);
    }
  }
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    reason: `Patch imports missing module(s): ${[...new Set(missing)].join(", ")}`,
  };
}

/** Validate proposed content for a new follow-up source file. */
export function validateCreateProposalQuality(
  after: string,
  relPath: string,
  scan?: ProjectScan | null,
): ProposalQualityResult {
  const trimmedPath = relPath.trim();
  if (!trimmedPath || trimmedPath.includes("..")) {
    return { ok: false, reason: `Invalid file target: ${relPath}` };
  }
  if (!after.trim()) {
    return { ok: false, reason: "New file content is empty." };
  }
  if (after.includes("\u0000")) {
    return { ok: false, reason: "The new file would introduce binary content." };
  }
  if (new TextEncoder().encode(after).length > MAX_EDIT_BYTES) {
    return { ok: false, reason: "The result exceeds the 2 MB limit." };
  }
  const stats = diffLineStats("", after);
  if (!stats.changed) {
    return { ok: false, reason: "New file produces no content." };
  }
  const importCheck = validateProposalRelativeImports(after, scan, relPath);
  if (!importCheck.ok) {
    return importCheck;
  }
  return { ok: true, stats };
}
