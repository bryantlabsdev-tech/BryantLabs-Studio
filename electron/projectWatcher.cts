import { watch, promises as fs, type FSWatcher } from "node:fs";
import * as path from "node:path";
import {
  isIgnoredProjectPath,
  SCAN_IGNORED_DIR_NAMES,
} from "./projectScanner.cjs";

const DEFAULT_DEBOUNCE_MS = 200;

export interface WatchBatch {
  readonly changed: string[];
  readonly added: string[];
  readonly deleted: string[];
}

export interface ProjectWatcherOptions {
  readonly debounceMs?: number;
  readonly onBatch: (batch: WatchBatch) => void;
}

function shouldIgnoreAbs(root: string, absPath: string): boolean {
  const rel = path.relative(root, absPath).replace(/\\/g, "/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return true;
  if (rel === "" || rel === ".") return false;
  for (const segment of rel.split("/")) {
    if (SCAN_IGNORED_DIR_NAMES.has(segment)) return true;
  }
  return isIgnoredProjectPath(rel);
}

/**
 * Watch project root for add/change/delete. Debounces events and classifies
 * touched paths via stat (exists → change/add, missing → delete).
 */
export function startProjectWatcher(
  root: string,
  opts: ProjectWatcherOptions,
): () => void {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;
  let closed = false;

  const flush = async (): Promise<void> => {
    timer = null;
    if (closed || pending.size === 0) return;
    const absPaths = [...pending];
    pending.clear();

    const changed: string[] = [];
    const deleted: string[] = [];

    for (const absPath of absPaths) {
      if (shouldIgnoreAbs(root, absPath)) continue;
      const rel = path.relative(root, absPath).replace(/\\/g, "/");
      if (!rel || rel.startsWith("..")) continue;

      try {
        const stat = await fs.stat(absPath);
        if (stat.isDirectory()) continue;
        if (stat.isFile()) {
          changed.push(rel);
        }
      } catch {
        deleted.push(rel);
      }
    }

    if (changed.length === 0 && deleted.length === 0) return;
    opts.onBatch({ changed, added: changed, deleted });
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, debounceMs);
  };

  const onEvent = (_event: string, filename: string | Buffer | null): void => {
    if (closed || filename === null) return;
    const name = typeof filename === "string" ? filename : filename.toString();
    const absPath = path.join(root, name);
    if (shouldIgnoreAbs(root, absPath)) return;
    pending.add(absPath);
    schedule();
  };

  try {
    watcher = watch(root, { recursive: true }, onEvent);
  } catch {
    watcher = watch(root, onEvent);
  }

  watcher.on("error", () => {
    // Watcher errors are non-fatal — index can still be refreshed manually.
  });

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
