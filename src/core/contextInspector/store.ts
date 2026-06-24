import type { ContextSnapshot } from "@/core/contextInspector/types";

const STORAGE_KEY = "bryantlabs.contextHistory.v1";
const MAX_ENTRIES = 50;

interface StoredHistory {
  readonly version: 1;
  readonly entries: ContextSnapshot[];
}

function readRaw(): StoredHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: [] };
    const data = JSON.parse(raw) as StoredHistory;
    if (data.version !== 1 || !Array.isArray(data.entries)) {
      return { version: 1, entries: [] };
    }
    return data;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeRaw(entries: ContextSnapshot[]): void {
  const payload: StoredHistory = {
    version: 1,
    entries: entries.slice(0, MAX_ENTRIES),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadContextHistory(projectPath: string | null): ContextSnapshot[] {
  const all = readRaw().entries;
  if (!projectPath) return all.slice(0, MAX_ENTRIES);
  return all
    .filter((e) => e.projectPath === projectPath)
    .slice(0, MAX_ENTRIES);
}

export function appendContextHistory(snapshot: ContextSnapshot): ContextSnapshot[] {
  const all = readRaw().entries;
  const next = [snapshot, ...all.filter((e) => e.id !== snapshot.id)].slice(
    0,
    MAX_ENTRIES,
  );
  writeRaw(next);
  return snapshot.projectPath
    ? next.filter((e) => e.projectPath === snapshot.projectPath)
    : next;
}

export function clearContextHistory(projectPath?: string | null): void {
  if (!projectPath) {
    writeRaw([]);
    return;
  }
  const kept = readRaw().entries.filter((e) => e.projectPath !== projectPath);
  writeRaw(kept);
}

export function findContextSnapshot(
  id: string,
  projectPath: string | null,
): ContextSnapshot | null {
  return (
    loadContextHistory(projectPath).find((e) => e.id === id) ??
    readRaw().entries.find((e) => e.id === id) ??
    null
  );
}
