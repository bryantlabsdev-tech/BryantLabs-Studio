import * as path from "node:path";
import { promises as fs } from "node:fs";
import { safeWriteText, writeBryantlabsJson } from "./safeFs.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

const MEMORY_FILE = "agent-memory.json";

export interface AgentMemoryStoreRecord {
  version: number;
  projectPath: string;
  memories: unknown[];
  stats: {
    retrievalCount: number;
    hitCount: number;
    missCount: number;
  };
  settings: {
    autoSaveSuccessfulMemories: boolean;
  };
}

function memoryPath(projectRoot: string): string {
  return path.join(projectRoot, ".bryantlabs", MEMORY_FILE);
}

export async function readAgentMemory(
  projectRoot: string,
): Promise<AgentMemoryStoreRecord | null> {
  const file = memoryPath(projectRoot);
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw) as Partial<AgentMemoryStoreRecord>;
    return {
      version: typeof data.version === "number" ? data.version : 1,
      projectPath: projectRoot,
      memories: Array.isArray(data.memories) ? data.memories : [],
      stats: {
        retrievalCount:
          typeof data.stats?.retrievalCount === "number"
            ? data.stats.retrievalCount
            : 0,
        hitCount:
          typeof data.stats?.hitCount === "number" ? data.stats.hitCount : 0,
        missCount:
          typeof data.stats?.missCount === "number" ? data.stats.missCount : 0,
      },
      settings: {
        autoSaveSuccessfulMemories:
          data.settings?.autoSaveSuccessfulMemories === true,
      },
    };
  } catch {
    return null;
  }
}

export async function writeAgentMemory(
  projectRoot: string,
  store: AgentMemoryStoreRecord,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isActiveProjectRoot(projectRoot)) {
    return { ok: false, reason: "Project is no longer active." };
  }
  const payload: AgentMemoryStoreRecord = {
    ...store,
    version: 1,
    projectPath: projectRoot,
  };
  return writeBryantlabsJson(projectRoot, MEMORY_FILE, payload, "filesystem");
}

export async function exportAgentMemoryFile(
  exportPath: string,
  store: AgentMemoryStoreRecord,
): Promise<{ ok: boolean; reason?: string }> {
  return safeWriteText(
    exportPath,
    `${JSON.stringify({ ...store, exportedAt: Date.now() }, null, 2)}\n`,
    { logTag: "filesystem" },
  );
}

export async function importAgentMemoryFile(
  importPath: string,
): Promise<{ ok: boolean; store?: AgentMemoryStoreRecord; reason?: string }> {
  try {
    const raw = await fs.readFile(importPath, "utf8");
    const data = JSON.parse(raw) as Partial<AgentMemoryStoreRecord>;
    if (!Array.isArray(data.memories)) {
      return { ok: false, reason: "Invalid memory export file." };
    }
    return {
      ok: true,
      store: {
        version: typeof data.version === "number" ? data.version : 1,
        projectPath: typeof data.projectPath === "string" ? data.projectPath : "",
        memories: data.memories,
        stats: {
          retrievalCount: data.stats?.retrievalCount ?? 0,
          hitCount: data.stats?.hitCount ?? 0,
          missCount: data.stats?.missCount ?? 0,
        },
        settings: {
          autoSaveSuccessfulMemories:
            data.settings?.autoSaveSuccessfulMemories === true,
        },
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not import memory.";
    return { ok: false, reason: message };
  }
}
