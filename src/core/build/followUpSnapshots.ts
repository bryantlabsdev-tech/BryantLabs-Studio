import type { FollowUpCheckpointFile } from "./followUpCheckpoint";
import { restoreFollowUpCheckpoint } from "./followUpCheckpoint";
import type { BryantLabsApi } from "@/types";

const STORAGE_PREFIX = "bryantlabs.followUpSnapshots.";
const MAX_SNAPSHOTS = 30;

export interface FollowUpSnapshot {
  readonly id: string;
  readonly index: number;
  readonly prompt: string;
  readonly label: string;
  readonly createdAt: number;
  readonly files: readonly FollowUpCheckpointFile[];
}

function storageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${projectPath}`;
}

export function loadFollowUpSnapshots(projectPath: string): FollowUpSnapshot[] {
  if (!projectPath) return [];
  try {
    const raw = localStorage.getItem(storageKey(projectPath));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FollowUpSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFollowUpSnapshots(
  projectPath: string,
  snapshots: readonly FollowUpSnapshot[],
): void {
  if (!projectPath) return;
  try {
    localStorage.setItem(storageKey(projectPath), JSON.stringify(snapshots.slice(-MAX_SNAPSHOTS)));
  } catch {
    /* ignore */
  }
}

export function snapshotLabelFromPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return "Snapshot";
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}…`;
}

export function appendFollowUpSnapshot(
  projectPath: string,
  input: {
    prompt: string;
    files: readonly FollowUpCheckpointFile[];
  },
): FollowUpSnapshot[] {
  const existing = loadFollowUpSnapshots(projectPath);
  const index = existing.length + 1;
  const snapshot: FollowUpSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    index,
    prompt: input.prompt,
    label: snapshotLabelFromPrompt(input.prompt),
    createdAt: Date.now(),
    files: input.files,
  };
  const next = [...existing, snapshot].slice(-MAX_SNAPSHOTS);
  saveFollowUpSnapshots(projectPath, next);
  return next;
}

export async function restoreFollowUpSnapshot(
  api: BryantLabsApi,
  snapshot: FollowUpSnapshot,
): Promise<{ ok: boolean; error?: string }> {
  return restoreFollowUpCheckpoint(api, {
    id: snapshot.id,
    projectPath: "",
    createdAt: snapshot.createdAt,
    prompt: snapshot.prompt,
    files: snapshot.files,
  });
}
