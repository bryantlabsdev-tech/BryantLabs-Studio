import { promises as fs } from "node:fs";
import { scanProject, type ProjectScan } from "../projectScanner.cjs";
import { getCachedProjectScan } from "../projectIndex/coordinator.cjs";
import { buildChunksFromScan } from "./chunker.cjs";
import {
  patchSemanticChunks,
  type SemanticDelta,
} from "./incrementalSemantic.cjs";
import {
  loadSemanticIndex,
  persistedToRuntime,
  saveSemanticIndex,
} from "./store.cjs";
import { buildTfidfIndex, SemanticIndexTooLargeError } from "./vectors.cjs";
import { MAX_CHUNK_FILE_BYTES } from "./limits.cjs";
import { searchSemanticIndex } from "./search.cjs";
import {
  captureProjectWriteToken,
  isWriteTokenCurrent,
} from "../projectWriteCoordinator.cjs";

export interface SemanticIndexRuntime {
  chunks: import("./chunker.cjs").SemanticChunkRecord[];
  tfidf: import("./vectors.cjs").TfidfIndex;
  builtAt: number;
}

let runtime: SemanticIndexRuntime | null = null;
let building = false;
let lastError: string | null = null;

async function readText(absPath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile() || stat.size > MAX_CHUNK_FILE_BYTES) return null;
    const buf = await fs.readFile(absPath);
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

export function getSemanticIndexRuntime(): SemanticIndexRuntime | null {
  return runtime;
}

export function isSemanticIndexBuilding(): boolean {
  return building;
}

export function getSemanticIndexLastError(): string | null {
  return lastError;
}

export async function hydrateSemanticIndex(
  projectRoot: string,
): Promise<boolean> {
  const persisted = await loadSemanticIndex(projectRoot);
  if (!persisted) {
    runtime = null;
    return false;
  }
  const { chunks, tfidf } = persistedToRuntime(persisted);
  runtime = { chunks, tfidf, builtAt: persisted.builtAt };
  lastError = null;
  return true;
}

export async function rebuildSemanticIndex(
  projectRoot: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (building) return { ok: false, reason: "Index build already in progress." };
  const writeToken = captureProjectWriteToken(projectRoot);
  if (writeToken < 0) {
    return { ok: false, reason: "Project is not active." };
  }
  building = true;
  lastError = null;
  try {
    const scan = getCachedProjectScan() ?? (await scanProject(projectRoot));
    if (!isWriteTokenCurrent(projectRoot, writeToken)) {
      return { ok: false, reason: "Project changed during index build." };
    }
    const chunks = await buildChunksFromScan(scan, readText);
    if (!isWriteTokenCurrent(projectRoot, writeToken)) {
      return { ok: false, reason: "Project changed during index build." };
    }
    const tfidf = buildTfidfIndex(chunks);
    const saved = await saveSemanticIndex(projectRoot, chunks, tfidf, writeToken);
    if (!saved.ok) {
      lastError = saved.reason ?? "Index save failed.";
      return saved;
    }
    if (!isWriteTokenCurrent(projectRoot, writeToken)) {
      return { ok: false, reason: "Project changed during index build." };
    }
    runtime = { chunks, tfidf, builtAt: Date.now() };
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof SemanticIndexTooLargeError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Index build failed.";
    lastError = message;
    console.warn(`[semantic_index] build failed — ${message}`);
    return { ok: false, reason: message };
  } finally {
    building = false;
  }
}

/** Incrementally patch TF-IDF chunks for changed files (no full repo read). */
export async function applySemanticIndexDelta(
  projectRoot: string,
  scan: ProjectScan,
  delta: SemanticDelta,
): Promise<{ ok: boolean; reason?: string }> {
  const touched = delta.changed.length + delta.added.length + delta.deleted.length;
  if (touched === 0) return { ok: true };

  if (building) return { ok: false, reason: "Index build already in progress." };
  const writeToken = captureProjectWriteToken(projectRoot);
  if (writeToken < 0) {
    return { ok: false, reason: "Project is not active." };
  }

  building = true;
  lastError = null;
  try {
    let baseChunks = runtime?.chunks ?? [];
    if (baseChunks.length === 0) {
      const hydrated = await hydrateSemanticIndex(projectRoot);
      if (hydrated && runtime) {
        baseChunks = runtime.chunks;
      }
    }

    const chunks = await patchSemanticChunks(baseChunks, scan, delta, readText);
    if (!isWriteTokenCurrent(projectRoot, writeToken)) {
      return { ok: false, reason: "Project changed during index build." };
    }

    const tfidf = buildTfidfIndex(chunks);
    const saved = await saveSemanticIndex(projectRoot, chunks, tfidf, writeToken);
    if (!saved.ok) {
      lastError = saved.reason ?? "Index save failed.";
      return saved;
    }
    if (!isWriteTokenCurrent(projectRoot, writeToken)) {
      return { ok: false, reason: "Project changed during index build." };
    }

    runtime = { chunks, tfidf, builtAt: Date.now() };
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof SemanticIndexTooLargeError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Semantic delta failed.";
    lastError = message;
    console.warn(`[semantic_index] delta failed — ${message}`);
    return { ok: false, reason: message };
  } finally {
    building = false;
  }
}

export async function ensureSemanticIndexForScan(
  projectRoot: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (runtime !== null) return { ok: true };
  const hydrated = await hydrateSemanticIndex(projectRoot);
  if (hydrated) return { ok: true };
  return rebuildSemanticIndex(projectRoot);
}

export function semanticSearch(
  query: string,
  limit?: number,
): import("./search.cjs").SemanticSearchResult[] {
  if (!runtime) return [];
  return searchSemanticIndex(query, runtime.chunks, runtime.tfidf, limit);
}

export function clearSemanticIndex(): void {
  runtime = null;
  lastError = null;
}
