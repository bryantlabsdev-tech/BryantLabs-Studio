import { promises as fs } from "node:fs";
import type { SemanticChunkRecord } from "./chunker.cjs";
import type { TfidfIndex } from "./vectors.cjs";
import {
  enqueueSerializedWrite,
  writeBryantlabsJson,
  validateProjectRootForMetadata,
  bryantlabsFilePath,
} from "../safeFs.cjs";
import { isWriteTokenCurrent } from "../projectWriteCoordinator.cjs";
import { MAX_TFIDF_FLOATS, tfidfWithinLimits } from "./limits.cjs";

export interface PersistedSemanticIndex {
  readonly version: 1;
  readonly projectPath: string;
  readonly builtAt: number;
  readonly mode: "tfidf";
  readonly chunks: SemanticChunkRecord[];
  readonly vocabulary: string[];
  readonly idf: number[];
  readonly vectors: number[];
}

const INDEX_RELATIVE = "semantic-index/v1.json";

function indexPath(root: string): string {
  return bryantlabsFilePath(root, "semantic-index", "v1.json");
}

export async function loadSemanticIndex(
  root: string,
): Promise<PersistedSemanticIndex | null> {
  const check = validateProjectRootForMetadata(root);
  if (!check.ok || !check.path) return null;
  try {
    const raw = await fs.readFile(indexPath(check.path), "utf8");
    const parsed = JSON.parse(raw) as PersistedSemanticIndex;
    if (parsed.version !== 1 || parsed.projectPath !== check.path) return null;
    if (
      parsed.chunks.length > 0 &&
      !tfidfWithinLimits(parsed.chunks.length, parsed.vocabulary.length)
    ) {
      console.warn("[semantic_index] persisted index exceeds safe limits — ignored");
      return null;
    }
    if (parsed.vectors.length > MAX_TFIDF_FLOATS) {
      console.warn("[semantic_index] persisted vectors too large — ignored");
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSemanticIndex(
  root: string,
  chunks: readonly SemanticChunkRecord[],
  tfidf: TfidfIndex,
  writeToken?: number,
): Promise<{ ok: boolean; reason?: string }> {
  const check = validateProjectRootForMetadata(root);
  if (!check.ok || !check.path) {
    console.warn(`[semantic_index] write failed — ${check.reason ?? "invalid project root"}`);
    return { ok: false, reason: check.reason ?? "Invalid project root." };
  }

  if (writeToken !== undefined && !isWriteTokenCurrent(check.path, writeToken)) {
    console.warn("[semantic_index] write ignored — project changed during build");
    return { ok: false, reason: "Project changed during index build." };
  }

  if (!tfidfWithinLimits(chunks.length, tfidf.vocabulary.length)) {
    const reason = "Semantic index exceeds safe persistence limits.";
    console.warn(`[semantic_index] write skipped — ${reason}`);
    return { ok: false, reason };
  }

  const vectorValues =
    tfidf.vectors.length <= MAX_TFIDF_FLOATS
      ? Array.from(tfidf.vectors)
      : [];

  const payload: PersistedSemanticIndex = {
    version: 1,
    projectPath: check.path,
    builtAt: Date.now(),
    mode: "tfidf",
    chunks: [...chunks],
    vocabulary: [...tfidf.vocabulary],
    idf: Array.from(tfidf.idf),
    vectors: vectorValues,
  };

  const key = indexPath(check.path);
  return enqueueSerializedWrite(key, () =>
    writeBryantlabsJson(check.path!, INDEX_RELATIVE, payload, "semantic_index"),
  );
}

export function persistedToRuntime(
  data: PersistedSemanticIndex,
): { chunks: SemanticChunkRecord[]; tfidf: TfidfIndex } {
  return {
    chunks: data.chunks,
    tfidf: {
      vocabulary: data.vocabulary,
      idf: new Float32Array(data.idf),
      vectors: new Float32Array(data.vectors),
      chunkCount: data.chunks.length,
      dim: data.vocabulary.length,
    },
  };
}
