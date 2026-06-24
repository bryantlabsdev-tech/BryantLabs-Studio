const STORAGE_KEY = "bryantlabs.fileSelectionHistory.v1";
const MAX_ENTRIES = 200;

export interface FileHistoryEntry {
  readonly path: string;
  readonly prompt: string;
  readonly featureTags: readonly string[];
  readonly success: boolean;
  readonly at: number;
}

interface StoredHistory {
  readonly version: 1;
  readonly entries: FileHistoryEntry[];
}

/** In-memory fallback when localStorage is unavailable or unreliable (e.g. unit tests). */
let memoryEntries: FileHistoryEntry[] = [];

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readRaw(): StoredHistory {
  if (!storageAvailable()) {
    return { version: 1, entries: [...memoryEntries] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { version: 1, entries: [...memoryEntries] };
    }
    const data = JSON.parse(raw) as StoredHistory;
    if (data.version !== 1 || !Array.isArray(data.entries)) {
      return { version: 1, entries: [...memoryEntries] };
    }
    memoryEntries = [...data.entries];
    return data;
  } catch {
    return { version: 1, entries: [...memoryEntries] };
  }
}

function writeRaw(entries: FileHistoryEntry[]): void {
  memoryEntries = entries.slice(0, MAX_ENTRIES);
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, entries: memoryEntries }),
    );
  } catch {
    // Keep in-memory copy for this session.
  }
}

export function loadFileHistory(_projectPath?: string | null): FileHistoryEntry[] {
  return readRaw().entries;
}

function pathScoreFromHistory(
  path: string,
  entries: FileHistoryEntry[],
  promptLower: string,
): { boost: number; reason: string | null } {
  const norm = path.toLowerCase();
  let boost = 0;
  const reasons: string[] = [];

  const successCount = entries.filter(
    (e) => e.path.toLowerCase() === norm && e.success,
  ).length;
  if (successCount > 0) {
    boost += Math.min(8, successCount * 2);
    reasons.push(`Modified successfully ${successCount} time(s)`);
  }

  const featureHits = entries.filter(
    (e) =>
      e.path.toLowerCase() === norm &&
      e.featureTags.some((t) => promptLower.includes(t.toLowerCase())),
  );
  if (featureHits.length > 0) {
    boost += 5;
    reasons.push("Previously edited for similar feature");
  }

  const freq = entries.filter((e) => e.path.toLowerCase() === norm).length;
  if (freq >= 3) {
    boost += 3;
    reasons.push("Frequently selected file");
  }

  return {
    boost,
    reason: reasons[0] ?? null,
  };
}

export function historyBoostForPath(
  path: string,
  projectPath: string | null,
  promptLower: string,
): { boost: number; reason: string | null } {
  void projectPath;
  return pathScoreFromHistory(path, readRaw().entries, promptLower);
}

export function recordFileHistory(opts: {
  projectPath: string | null;
  paths: readonly string[];
  prompt: string;
  featureTags: readonly string[];
  success: boolean;
}): void {
  const entries = [...readRaw().entries];
  const at = Date.now();
  for (const path of opts.paths) {
    entries.unshift({
      path,
      prompt: opts.prompt.slice(0, 500),
      featureTags: [...opts.featureTags],
      success: opts.success,
      at,
    });
  }
  writeRaw(entries);
}

export function aggregateHistoryByPath(
  projectPath: string | null,
): Map<string, number> {
  void projectPath;
  const counts = new Map<string, number>();
  for (const e of readRaw().entries) {
    if (!e.success) continue;
    counts.set(e.path, (counts.get(e.path) ?? 0) + 1);
  }
  return counts;
}
