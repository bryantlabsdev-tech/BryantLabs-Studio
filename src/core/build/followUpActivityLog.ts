import type { FollowUpActivityItem } from "./followUpRun";

const STORAGE_PREFIX = "bryantlabs.followUpActivity.";
const MAX_RUNS = 20;
const MAX_ITEMS_PER_RUN = 40;

export interface FollowUpActivityRun {
  readonly runId: string;
  readonly prompt: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly items: readonly FollowUpActivityItem[];
}

function storageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${projectPath}`;
}

export function loadFollowUpActivityRuns(projectPath: string): FollowUpActivityRun[] {
  if (!projectPath) return [];
  try {
    const raw = localStorage.getItem(storageKey(projectPath));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FollowUpActivityRun[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFollowUpActivityRuns(
  projectPath: string,
  runs: readonly FollowUpActivityRun[],
): void {
  if (!projectPath) return;
  try {
    localStorage.setItem(storageKey(projectPath), JSON.stringify(runs.slice(-MAX_RUNS)));
  } catch {
    /* ignore */
  }
}

export function beginFollowUpActivityRun(
  _projectPath: string,
  prompt: string,
): FollowUpActivityRun {
  return {
    runId: `run-${Date.now()}`,
    prompt,
    startedAt: Date.now(),
    completedAt: null,
    items: [],
  };
}

export function appendFollowUpActivityItem(
  run: FollowUpActivityRun,
  item: FollowUpActivityItem,
): FollowUpActivityRun {
  const items = [...run.items, item].slice(-MAX_ITEMS_PER_RUN);
  return { ...run, items };
}

export function completeFollowUpActivityRun(
  projectPath: string,
  run: FollowUpActivityRun,
): FollowUpActivityRun[] {
  const completed = { ...run, completedAt: Date.now() };
  const existing = loadFollowUpActivityRuns(projectPath).filter((r) => r.runId !== run.runId);
  const next = [...existing, completed].slice(-MAX_RUNS);
  saveFollowUpActivityRuns(projectPath, next);
  return next;
}
