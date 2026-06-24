import * as path from "node:path";
import {
  indexSingleProjectFile,
  isIgnoredProjectPath,
  recomputeProjectScanDerived,
  type ProjectScan,
} from "../projectScanner.cjs";

export interface ScanDelta {
  readonly changed: string[];
  readonly added: string[];
  readonly deleted: string[];
}

function countExt(scan: ProjectScan): { ts: number; js: number } {
  let ts = 0;
  let js = 0;
  for (const file of scan.files) {
    const ext = path.extname(file.path).toLowerCase();
    if (ext === ".ts" || ext === ".tsx" || ext === ".cts" || ext === ".mts") {
      ts += 1;
    } else if (
      ext === ".js" ||
      ext === ".jsx" ||
      ext === ".cjs" ||
      ext === ".mjs"
    ) {
      js += 1;
    }
  }
  return { ts, js };
}

function removePaths(scan: ProjectScan, relPaths: readonly string[]): ProjectScan {
  const drop = new Set(relPaths);
  const files = scan.files.filter((f) => !drop.has(f.path));
  const index = scan.index.filter((f) => !drop.has(f.path));
  const { ts, js } = countExt({ ...scan, files });
  return {
    ...scan,
    files,
    index,
    summary: {
      ...scan.summary,
      totalFiles: files.length,
      language:
        scan.summary.detections.tsconfig || ts > 0
          ? "TypeScript"
          : js > 0
            ? "JavaScript"
            : scan.summary.language,
    },
  };
}

async function upsertPaths(
  scan: ProjectScan,
  root: string,
  relPaths: readonly string[],
): Promise<ProjectScan> {
  const filesByPath = new Map(scan.files.map((f) => [f.path, f]));
  const indexByPath = new Map(scan.index.map((f) => [f.path, f]));

  for (const relPath of relPaths) {
    if (isIgnoredProjectPath(relPath)) continue;
    const indexed = await indexSingleProjectFile(root, relPath);
    if (!indexed) {
      filesByPath.delete(relPath);
      indexByPath.delete(relPath);
      continue;
    }
    filesByPath.set(relPath, indexed.file);
    if (indexed.index) {
      indexByPath.set(relPath, indexed.index);
    } else {
      indexByPath.delete(relPath);
    }
  }

  const files = [...filesByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const index = [...indexByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const { ts, js } = countExt({ ...scan, files });

  return {
    ...scan,
    files,
    index,
    summary: {
      ...scan.summary,
      totalFiles: files.length,
      language:
        scan.summary.detections.tsconfig || ts > 0
          ? "TypeScript"
          : js > 0
            ? "JavaScript"
            : scan.summary.language,
    },
  };
}

/** Apply file add/change/delete events to an in-memory project scan. */
export async function applyScanDelta(
  scan: ProjectScan,
  root: string,
  delta: ScanDelta,
): Promise<ProjectScan> {
  const deleted = [...new Set(delta.deleted)].filter(Boolean);
  const upsert = [...new Set([...delta.changed, ...delta.added])].filter(Boolean);

  let next = scan;
  if (deleted.length > 0) {
    next = removePaths(next, deleted);
  }
  if (upsert.length > 0) {
    next = await upsertPaths(next, root, upsert);
  }
  return recomputeProjectScanDerived(next);
}

export function relPathFromAbs(root: string, absPath: string): string | null {
  const rel = path.relative(root, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.replace(/\\/g, "/");
}
