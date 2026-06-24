import type { StudioAnalyticsRecord } from "@/core/analytics/types";

const STORAGE_KEY = "bryantlabs.studioAnalytics.v1";
export const MAX_ANALYTICS_PER_PROJECT = 500;

interface StoredAnalytics {
  readonly version: 1;
  readonly entries: StudioAnalyticsRecord[];
}

function readRaw(): StoredAnalytics {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: [] };
    const data = JSON.parse(raw) as StoredAnalytics;
    if (data.version !== 1 || !Array.isArray(data.entries)) {
      return { version: 1, entries: [] };
    }
    return data;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeRaw(entries: StudioAnalyticsRecord[]): void {
  const payload: StoredAnalytics = { version: 1, entries };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadAnalyticsHistory(projectPath: string | null): StudioAnalyticsRecord[] {
  const all = readRaw().entries;
  if (!projectPath) return all.slice(0, MAX_ANALYTICS_PER_PROJECT);
  return all
    .filter((e) => e.projectPath === projectPath)
    .slice(0, MAX_ANALYTICS_PER_PROJECT);
}

export function appendAnalyticsRecord(
  record: StudioAnalyticsRecord,
): StudioAnalyticsRecord[] {
  const all = readRaw().entries;
  const withoutDup = all.filter((e) => e.id !== record.id);
  const next = [record, ...withoutDup];
  const projectPath = record.projectPath;
  if (projectPath) {
    const projectEntries = next.filter((e) => e.projectPath === projectPath);
    const other = next.filter((e) => e.projectPath !== projectPath);
    const capped = [
      ...projectEntries.slice(0, MAX_ANALYTICS_PER_PROJECT),
      ...other,
    ];
    writeRaw(capped);
    return projectEntries.slice(0, MAX_ANALYTICS_PER_PROJECT);
  }
  writeRaw(next.slice(0, MAX_ANALYTICS_PER_PROJECT * 4));
  return next.slice(0, MAX_ANALYTICS_PER_PROJECT);
}

export function findAnalyticsRecord(
  id: string,
  projectPath: string | null,
): StudioAnalyticsRecord | null {
  return (
    loadAnalyticsHistory(projectPath).find((e) => e.id === id) ??
    readRaw().entries.find((e) => e.id === id) ??
    null
  );
}

export function clearAnalyticsHistory(projectPath?: string | null): void {
  if (!projectPath) {
    writeRaw([]);
    return;
  }
  const kept = readRaw().entries.filter((e) => e.projectPath !== projectPath);
  writeRaw(kept);
}
