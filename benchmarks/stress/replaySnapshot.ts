import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  defaultLiveStressRoot,
  defaultReplayFrozenRoot,
  legacyStressOutputRoot,
  projectDir,
} from "./stressPaths";

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist"]);

export interface LockReplaySnapshotResult {
  readonly frozenRoot: string;
  readonly sourceRoot: string;
  readonly locked: readonly string[];
  readonly skipped: readonly string[];
  readonly missing: readonly string[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function copyProjectTree(source: string, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  async function walk(rel: string): Promise<void> {
    const absSrc = join(source, rel);
    const absDest = join(dest, rel);
    const entries = await readdir(absSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const from = join(source, childRel);
      const to = join(dest, childRel);
      if (entry.isDirectory()) {
        await mkdir(to, { recursive: true });
        await walk(childRel);
        continue;
      }
      await cp(from, to);
    }
  }

  await walk("");
}

/**
 * Copy live (or legacy) project folders into the frozen replay corpus.
 * Live stress must not write here — only this lock step updates replay-frozen.
 */
export async function lockReplaySnapshot(options: {
  readonly projectIds: readonly string[];
  readonly sourceRoot?: string;
  readonly frozenRoot?: string;
}): Promise<LockReplaySnapshotResult> {
  const sourceRoot = options.sourceRoot ?? defaultLiveStressRoot();
  const frozenRoot = options.frozenRoot ?? defaultReplayFrozenRoot();
  await mkdir(frozenRoot, { recursive: true });

  const locked: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  for (const id of options.projectIds) {
    const src = projectDir(sourceRoot, id);
    const dest = projectDir(frozenRoot, id);
    if (!(await pathExists(src))) {
      missing.push(id);
      continue;
    }
    try {
      const pkg = join(src, "package.json");
      if (!(await pathExists(pkg))) {
        skipped.push(id);
        continue;
      }
      await copyProjectTree(src, dest);
      locked.push(id);
    } catch {
      skipped.push(id);
    }
  }

  return { frozenRoot, sourceRoot, locked, skipped, missing };
}

/** Resolve source root for locking: live first, then legacy flat layout. */
export async function resolveLockSourceRoot(
  preferred?: string,
): Promise<{ root: string; layout: "live" | "legacy" | "custom" }> {
  if (preferred) {
    return { root: preferred, layout: "custom" };
  }
  const live = defaultLiveStressRoot();
  if (await pathExists(live)) {
    return { root: live, layout: "live" };
  }
  return { root: legacyStressOutputRoot(), layout: "legacy" };
}
