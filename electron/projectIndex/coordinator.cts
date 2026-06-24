import type { BrowserWindow } from "electron";
import { scanProject, type ProjectScan } from "../projectScanner.cjs";
import { startProjectWatcher } from "../projectWatcher.cjs";
import { applyScanDelta } from "./deltaScanner.cjs";
import {
  applySemanticIndexDelta,
  ensureSemanticIndexForScan,
  getSemanticIndexRuntime,
  rebuildSemanticIndex,
} from "../semanticIndex/indexer.cjs";
import {
  loadManifest,
  MANIFEST_COVERAGE_THRESHOLD,
  saveManifest,
  validateManifestEntries,
} from "./manifest.cjs";
import {
  resetProjectProblemsState,
  scheduleProjectProblemsRefresh,
} from "../projectProblems/service.cjs";

export type ProjectIndexState = "ready" | "updating" | "stale";

export interface ProjectIndexStatus {
  readonly state: ProjectIndexState;
  readonly pendingFiles: number;
  readonly coverage: number | null;
  readonly builtAt: number | null;
  readonly fromCache: boolean;
}

export interface ProjectIndexUpdatedEvent {
  readonly changedPaths: string[];
  readonly deletedPaths: string[];
  readonly builtAt: number;
}

let activeRoot: string | null = null;
let currentScan: ProjectScan | null = null;
let indexState: ProjectIndexState = "updating";
let pendingFiles = 0;
let coverage: number | null = null;
let fromCache = false;
let stopWatcher: (() => void) | null = null;
let getWindow: (() => BrowserWindow | null) | null = null;
let deltaChain: Promise<void> = Promise.resolve();
let validating = false;

function emitStatus(): void {
  const win = getWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send("project:index-status", getProjectIndexStatus());
}

function emitUpdated(event: ProjectIndexUpdatedEvent): void {
  const win = getWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send("project:index-updated", event);
}

export function getProjectIndexStatus(): ProjectIndexStatus {
  return {
    state: indexState,
    pendingFiles,
    coverage,
    builtAt: currentScan?.scannedAt ?? null,
    fromCache,
  };
}

export function getCachedProjectScan(): ProjectScan | null {
  return currentScan;
}

function emitSemanticUpdated(builtAt: number): void {
  const win = getWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send("semantic:index-updated", { builtAt });
}

async function syncSemanticIndex(
  root: string,
  scan: ProjectScan,
  delta: { changed: string[]; added: string[]; deleted: string[] },
  opts?: { full?: boolean },
): Promise<void> {
  if (activeRoot !== root) return;
  try {
    if (opts?.full) {
      const result = await rebuildSemanticIndex(root);
      if (result.ok) {
        emitSemanticUpdated(Date.now());
      }
      return;
    }

    if (!getSemanticIndexRuntime()) {
      const ensured = await ensureSemanticIndexForScan(root);
      if (!ensured.ok || !getSemanticIndexRuntime()) {
        const result = await rebuildSemanticIndex(root);
        if (result.ok) {
          emitSemanticUpdated(Date.now());
        }
        return;
      }
    }

    const result = await applySemanticIndexDelta(root, scan, delta);
    if (result.ok) {
      emitSemanticUpdated(Date.now());
    }
  } catch (err) {
    console.warn(
      `[semantic_index] sync skipped — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function resetCoordinatorState(): void {
  activeRoot = null;
  currentScan = null;
  indexState = "updating";
  pendingFiles = 0;
  coverage = null;
  fromCache = false;
  deltaChain = Promise.resolve();
  validating = false;
}

export async function stopProjectIndex(): Promise<void> {
  stopWatcher?.();
  stopWatcher = null;
  resetProjectProblemsState();
  resetCoordinatorState();
}

async function persistScan(root: string, scan: ProjectScan): Promise<void> {
  await saveManifest(root, scan);
}

async function setScan(
  root: string,
  scan: ProjectScan,
  opts?: {
    changedPaths?: string[];
    deletedPaths?: string[];
    cache?: boolean;
    semanticFull?: boolean;
  },
): Promise<void> {
  currentScan = scan;
  coverage = 1;
  indexState = "ready";
  fromCache = opts?.cache ?? fromCache;
  pendingFiles = 0;
  await persistScan(root, scan);

  const changed = opts?.changedPaths ?? [];
  const deleted = opts?.deletedPaths ?? [];
  const useFullSemantic =
    opts?.semanticFull === true ||
    (opts?.semanticFull !== false && changed.length === 0 && deleted.length === 0);

  if (useFullSemantic) {
    await syncSemanticIndex(
      root,
      scan,
      { changed: [], added: [], deleted: [] },
      { full: true },
    );
  } else {
    await syncSemanticIndex(root, scan, {
      changed,
      added: changed,
      deleted,
    });
  }

  emitStatus();
  emitUpdated({
    changedPaths: changed,
    deletedPaths: deleted,
    builtAt: scan.scannedAt,
  });
  scheduleProjectProblemsRefresh(root);
}

async function fullRescan(root: string): Promise<void> {
  indexState = "updating";
  pendingFiles = 0;
  emitStatus();
  const scan = await scanProject(root);
  if (activeRoot !== root) return;
  fromCache = false;
  await setScan(root, scan);
}

async function backgroundValidate(root: string): Promise<void> {
  if (validating || activeRoot !== root) return;
  validating = true;
  try {
    const manifest = await loadManifest(root);
    if (!manifest || activeRoot !== root) return;
    const result = await validateManifestEntries(root, manifest.files);
    coverage = result.coverage;

    const drift = [
      ...result.changed,
      ...result.deleted,
      ...result.missing,
    ];
    if (result.coverage >= MANIFEST_COVERAGE_THRESHOLD && drift.length === 0) {
      indexState = "ready";
      emitStatus();
      return;
    }

    if (result.coverage >= MANIFEST_COVERAGE_THRESHOLD && currentScan) {
      indexState = "updating";
      emitStatus();
      const delta = {
        changed: result.changed,
        added: [],
        deleted: [...result.deleted, ...result.missing],
      };
      const next = await applyScanDelta(currentScan, root, delta);
      if (activeRoot !== root) return;
      await setScan(root, next, {
        changedPaths: delta.changed,
        deletedPaths: delta.deleted,
      });
      return;
    }

    indexState = "stale";
    emitStatus();
    await fullRescan(root);
  } finally {
    validating = false;
  }
}

function enqueueDelta(
  root: string,
  delta: { changed: string[]; added: string[]; deleted: string[] },
): void {
  if (!currentScan || activeRoot !== root) return;
  const touched = delta.changed.length + delta.added.length + delta.deleted.length;
  if (touched === 0) return;

  pendingFiles += touched;
  indexState = "updating";
  emitStatus();

  deltaChain = deltaChain
    .then(async () => {
      if (!currentScan || activeRoot !== root) return;
      const next = await applyScanDelta(currentScan, root, delta);
      if (activeRoot !== root) return;
      currentScan = next;
      pendingFiles = Math.max(0, pendingFiles - touched);
      indexState = pendingFiles > 0 ? "updating" : "ready";
      coverage = 1;
      await persistScan(root, next);
      await syncSemanticIndex(root, next, delta);
      emitStatus();
      emitUpdated({
        changedPaths: [...delta.changed, ...delta.added],
        deletedPaths: delta.deleted,
        builtAt: next.scannedAt,
      });
      scheduleProjectProblemsRefresh(root);
    })
    .catch((err) => {
      console.warn(
        `[project_index] delta failed — ${err instanceof Error ? err.message : String(err)}`,
      );
      indexState = "stale";
      pendingFiles = 0;
      emitStatus();
    });
}

/** Notify the coordinator that files changed (e.g. after IPC writes). */
export function notifyProjectFilesChanged(
  root: string,
  relPaths: readonly string[],
  deleted: readonly string[] = [],
): void {
  if (activeRoot !== root || (relPaths.length === 0 && deleted.length === 0)) return;
  enqueueDelta(root, {
    changed: [...relPaths],
    added: [...relPaths],
    deleted: [...deleted],
  });
}

export async function activateProjectIndex(
  root: string,
  windowGetter: () => BrowserWindow | null,
): Promise<void> {
  await stopProjectIndex();
  activeRoot = root;
  getWindow = windowGetter;
  indexState = "updating";
  fromCache = false;
  emitStatus();

  const manifest = await loadManifest(root);
  if (manifest?.scan && activeRoot === root) {
    currentScan = manifest.scan;
    fromCache = true;
    coverage = 1;
    indexState = "ready";
    emitStatus();
    emitUpdated({
      changedPaths: [],
      deletedPaths: [],
      builtAt: manifest.scan.scannedAt,
    });
    scheduleProjectProblemsRefresh(root);
    void backgroundValidate(root);
  } else if (activeRoot === root) {
    void fullRescan(root);
  }

  if (activeRoot !== root) return;

  stopWatcher = startProjectWatcher(root, {
    debounceMs: 200,
    onBatch: (batch) => {
      enqueueDelta(root, batch);
    },
  });
}

export async function ensureProjectScan(root: string): Promise<ProjectScan | null> {
  if (activeRoot === root && currentScan) return currentScan;
  if (activeRoot === root && indexState === "updating") {
    await deltaChain;
    return currentScan;
  }
  return null;
}

export async function forceProjectRescan(root: string): Promise<ProjectScan | null> {
  if (activeRoot !== root) return null;
  await fullRescan(root);
  return currentScan;
}
