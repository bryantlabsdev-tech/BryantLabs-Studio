const STORAGE_KEY = "bryantlabs.recentProjects";
const MAX_RECENT = 8;

export interface RecentProjectEntry {
  readonly path: string;
  readonly name: string;
  readonly openedAt: number;
}

function normalizePath(path: string): string {
  return path.replace(/[/\\]+$/, "");
}

function parseEntries(raw: string | null): RecentProjectEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RecentProjectEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as RecentProjectEntry).path === "string" &&
        typeof (item as RecentProjectEntry).name === "string" &&
        typeof (item as RecentProjectEntry).openedAt === "number"
      ) {
        out.push({
          path: (item as RecentProjectEntry).path,
          name: (item as RecentProjectEntry).name,
          openedAt: (item as RecentProjectEntry).openedAt,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function readRecentProjects(): readonly RecentProjectEntry[] {
  try {
    return parseEntries(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function recordRecentProject(path: string, name: string): void {
  const normalized = normalizePath(path);
  if (!normalized) return;
  const existing = readRecentProjects().filter(
    (entry) => normalizePath(entry.path) !== normalized,
  );
  const next: RecentProjectEntry[] = [
    {
      path: normalized,
      name:
        name.trim() ||
        (normalized.split(/[/\\]/).pop() ?? normalized),
      openedAt: Date.now(),
    },
    ...existing,
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}
