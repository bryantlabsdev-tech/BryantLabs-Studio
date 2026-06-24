import type { BryantLabsApi } from "@/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import {
  emptySessionMemory,
  normalizePersistedSessionMemory,
} from "@/core/sessionMemory/normalize";

export async function loadSessionMemoryFromDisk(
  api: BryantLabsApi | undefined,
  projectPath: string,
  branch: string | null,
): Promise<SessionMemorySnapshot> {
  if (!api?.readSessionMemory) {
    return emptySessionMemory(projectPath, branch);
  }
  try {
    const raw = await api.readSessionMemory();
    return normalizePersistedSessionMemory(raw, projectPath, branch);
  } catch {
    return emptySessionMemory(projectPath, branch);
  }
}

export async function saveSessionMemoryToDisk(
  api: BryantLabsApi | undefined,
  memory: SessionMemorySnapshot,
): Promise<void> {
  if (!api?.writeSessionMemory || !memory.projectPath) return;
  try {
    const { timeline: _timeline, ...persistable } = memory;
    await api.writeSessionMemory(persistable);
  } catch {
    /* ignore persistence errors */
  }
}

export function sessionMemoryToPersistPayload(
  memory: SessionMemorySnapshot,
): Omit<SessionMemorySnapshot, "timeline"> {
  const { timeline: _timeline, ...rest } = memory;
  return rest;
}
