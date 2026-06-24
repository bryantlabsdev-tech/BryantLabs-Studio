import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ProjectScan } from "../projectScanner.cjs";
import {
  bryantlabsFilePath,
  ensureBryantlabsDir,
  validateProjectRootForMetadata,
  writeBryantlabsJson,
} from "../safeFs.cjs";

export const MANIFEST_COVERAGE_THRESHOLD = 0.95;

export interface ManifestFileEntry {
  readonly mtimeMs: number;
  readonly size: number;
}

export interface PersistedScanManifest {
  readonly version: 1;
  readonly projectPath: string;
  readonly builtAt: number;
  readonly files: Record<string, ManifestFileEntry>;
  readonly scan: ProjectScan;
}

export interface ManifestValidationResult {
  readonly coverage: number;
  readonly changed: string[];
  readonly deleted: string[];
  readonly missing: string[];
}

function manifestPath(root: string): string {
  return bryantlabsFilePath(root, "scan-manifest", "v1.json");
}

export function buildManifestFilesFromScan(
  scan: ProjectScan,
): Record<string, ManifestFileEntry> {
  const files: Record<string, ManifestFileEntry> = {};
  for (const entry of scan.files) {
    files[entry.path] = { mtimeMs: 0, size: 0 };
  }
  return files;
}

/** Stat every indexed file and attach mtime/size to the manifest map. */
export async function stampManifestFiles(
  scan: ProjectScan,
): Promise<Record<string, ManifestFileEntry>> {
  const files: Record<string, ManifestFileEntry> = {};
  await Promise.all(
    scan.files.map(async (entry) => {
      try {
        const stat = await fs.stat(entry.absPath);
        if (!stat.isFile()) return;
        files[entry.path] = { mtimeMs: stat.mtimeMs, size: stat.size };
      } catch {
        // File disappeared during stamp — omit from manifest.
      }
    }),
  );
  return files;
}

export async function loadManifest(
  projectRoot: string,
): Promise<PersistedScanManifest | null> {
  const check = validateProjectRootForMetadata(projectRoot);
  if (!check.ok || !check.path) return null;
  try {
    const raw = await fs.readFile(manifestPath(check.path), "utf8");
    const parsed = JSON.parse(raw) as PersistedScanManifest;
    if (parsed.version !== 1 || parsed.projectPath !== check.path) return null;
    if (!parsed.scan || typeof parsed.files !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveManifest(
  projectRoot: string,
  scan: ProjectScan,
): Promise<{ ok: boolean; reason?: string }> {
  const check = validateProjectRootForMetadata(projectRoot);
  if (!check.ok || !check.path) {
    return { ok: false, reason: check.reason ?? "Invalid project root." };
  }
  const dirReady = await ensureBryantlabsDir(check.path);
  if (!dirReady.ok) {
    return { ok: false, reason: dirReady.reason ?? "Could not create metadata dir." };
  }
  const files = await stampManifestFiles(scan);
  const manifest: PersistedScanManifest = {
    version: 1,
    projectPath: check.path,
    builtAt: Date.now(),
    files,
    scan,
  };
  return writeBryantlabsJson(
    check.path,
    "scan-manifest/v1.json",
    manifest,
    "project_index",
  );
}

export async function validateManifestEntries(
  projectRoot: string,
  files: Record<string, ManifestFileEntry>,
): Promise<ManifestValidationResult> {
  const check = validateProjectRootForMetadata(projectRoot);
  if (!check.ok || !check.path) {
    return { coverage: 0, changed: [], deleted: [], missing: [] };
  }

  const paths = Object.keys(files);
  if (paths.length === 0) {
    return { coverage: 0, changed: [], deleted: [], missing: [] };
  }

  const changed: string[] = [];
  const deleted: string[] = [];
  const missing: string[] = [];
  let matched = 0;

  await Promise.all(
    paths.map(async (relPath) => {
      const expected = files[relPath];
      if (!expected) return;
      const absPath = path.join(check.path!, relPath);
      try {
        const stat = await fs.stat(absPath);
        if (!stat.isFile()) {
          missing.push(relPath);
          return;
        }
        if (
          stat.mtimeMs === expected.mtimeMs &&
          stat.size === expected.size
        ) {
          matched += 1;
          return;
        }
        changed.push(relPath);
      } catch {
        deleted.push(relPath);
      }
    }),
  );

  const coverage = matched / paths.length;
  return { coverage, changed, deleted, missing };
}
