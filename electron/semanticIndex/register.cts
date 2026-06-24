import type { IpcMain } from "electron";
import {
  clearSemanticIndex,
  getSemanticIndexLastError,
  getSemanticIndexRuntime,
  hydrateSemanticIndex,
  isSemanticIndexBuilding,
  rebuildSemanticIndex,
  semanticSearch,
} from "./indexer.cjs";

export function registerSemanticIndexIpc(
  ipcMain: IpcMain,
  getProjectRoot: () => string | null,
): void {
  ipcMain.handle("semanticIndex:status", async () => {
    const root = getProjectRoot();
    const runtime = getSemanticIndexRuntime();
    return {
      ready: runtime !== null,
      building: isSemanticIndexBuilding(),
      mode: runtime ? ("tfidf" as const) : null,
      chunkCount: runtime?.chunks.length ?? 0,
      fileCount: runtime
        ? new Set(runtime.chunks.map((c) => c.path)).size
        : 0,
      builtAt: runtime?.builtAt ?? null,
      lastError: getSemanticIndexLastError(),
      projectOpen: root !== null,
    };
  });

  ipcMain.handle("semanticIndex:rebuild", async () => {
    const root = getProjectRoot();
    if (!root) return { ok: false, reason: "No project open." };
    return rebuildSemanticIndex(root);
  });

  ipcMain.handle(
    "semanticIndex:search",
    async (_event, query: unknown, limit: unknown) => {
      if (typeof query !== "string" || query.trim().length === 0) {
        return [];
      }
      const lim =
        typeof limit === "number" && limit > 0
          ? Math.min(50, Math.floor(limit))
          : 12;
      return semanticSearch(query, lim);
    },
  );

  ipcMain.handle("semanticIndex:hydrate", async () => {
    const root = getProjectRoot();
    if (!root) {
      clearSemanticIndex();
      return { ok: false };
    }
    const ok = await hydrateSemanticIndex(root);
    return { ok };
  });
}
