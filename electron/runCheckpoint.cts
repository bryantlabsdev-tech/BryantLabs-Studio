import { app } from "electron";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import {
  enqueueSerializedWrite,
  writeBryantlabsJson,
  writeJsonAtomic,
  BRYANTLABS_DIR,
} from "./safeFs.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

const PROJECT_CHECKPOINT_FILE = "run-checkpoint.v1.json";
const LEGACY_USERDATA_FILE = "run-checkpoints.v1.json";

export interface StoredRunCheckpointsFile {
  readonly version: 1;
  readonly entries: unknown[];
}

function legacyUserDataPath(): string {
  return path.join(app.getPath("userData"), LEGACY_USERDATA_FILE);
}

function projectCheckpointPath(projectRoot: string): string {
  return path.join(projectRoot, BRYANTLABS_DIR, PROJECT_CHECKPOINT_FILE);
}

function pathsMatch(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

export async function readLegacyRunCheckpointsFile(): Promise<StoredRunCheckpointsFile> {
  const file = legacyUserDataPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw) as Partial<StoredRunCheckpointsFile>;
    if (data.version !== 1 || !Array.isArray(data.entries)) {
      return { version: 1, entries: [] };
    }
    return { version: 1, entries: data.entries };
  } catch {
    return { version: 1, entries: [] };
  }
}

export async function writeLegacyRunCheckpointsFile(
  entries: unknown[],
): Promise<{ ok: boolean; reason?: string }> {
  const file = legacyUserDataPath();
  const payload: StoredRunCheckpointsFile = { version: 1, entries };
  return writeJsonAtomic(file, payload, "checkpoint");
}

export async function readProjectRunCheckpoint(
  projectRoot: string,
): Promise<unknown | null> {
  const file = projectCheckpointPath(projectRoot);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function writeProjectRunCheckpoint(
  projectRoot: string,
  checkpoint: unknown,
): Promise<{ ok: boolean; reason?: string }> {
  const key = projectCheckpointPath(projectRoot);
  return enqueueSerializedWrite(key, () =>
    writeBryantlabsJson(
      projectRoot,
      PROJECT_CHECKPOINT_FILE,
      checkpoint,
      "checkpoint",
    ),
  );
}

export async function clearProjectRunCheckpoint(
  projectRoot: string,
): Promise<{ ok: boolean; reason?: string }> {
  const file = projectCheckpointPath(projectRoot);
  try {
    await fs.unlink(file);
    return { ok: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true };
    }
    const message = err instanceof Error ? err.message : "Could not clear run checkpoint.";
    console.warn(`[checkpoint] clear failed — ${message}`);
    return { ok: false, reason: message };
  }
}

/** Load per-project checkpoint, migrating from legacy userData store when needed. */
export async function loadRunCheckpointForProject(
  projectRoot: string,
  requestedProjectPath: string,
): Promise<unknown | null> {
  if (!pathsMatch(projectRoot, requestedProjectPath)) {
    return null;
  }

  let checkpoint = await readProjectRunCheckpoint(projectRoot);
  if (checkpoint) return checkpoint;

  const legacy = await readLegacyRunCheckpointsFile();
  const entry = legacy.entries.find(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      pathsMatch(
        (e as { projectPath?: string }).projectPath ?? "",
        requestedProjectPath,
      ),
  );
  if (!entry) return null;

  await writeProjectRunCheckpoint(projectRoot, entry);
  const kept = legacy.entries.filter(
    (e) =>
      !(
        typeof e === "object" &&
        e !== null &&
        pathsMatch(
          (e as { projectPath?: string }).projectPath ?? "",
          requestedProjectPath,
        )
      ),
  );
  await writeLegacyRunCheckpointsFile(kept);
  return entry;
}

export async function saveRunCheckpointForProject(
  projectRoot: string,
  checkpoint: unknown,
): Promise<{ ok: boolean; reason?: string }> {
  const projectPath = (checkpoint as { projectPath?: string }).projectPath;
  if (typeof projectPath !== "string" || !pathsMatch(projectRoot, projectPath)) {
    return { ok: false, reason: "Checkpoint project path does not match open project." };
  }
  if (!isActiveProjectRoot(projectRoot)) {
    console.warn("[checkpoint] write ignored — project no longer active");
    return { ok: false, reason: "Project is no longer active." };
  }
  return writeProjectRunCheckpoint(projectRoot, checkpoint);
}

export async function clearRunCheckpointForProject(
  projectRoot: string,
  requestedProjectPath: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!pathsMatch(projectRoot, requestedProjectPath)) {
    return { ok: false, reason: "Project path does not match open project." };
  }
  const projectResult = await clearProjectRunCheckpoint(projectRoot);

  const legacy = await readLegacyRunCheckpointsFile();
  const kept = legacy.entries.filter(
    (e) =>
      !(
        typeof e === "object" &&
        e !== null &&
        pathsMatch(
          (e as { projectPath?: string }).projectPath ?? "",
          requestedProjectPath,
        )
      ),
  );
  if (kept.length !== legacy.entries.length) {
    await writeLegacyRunCheckpointsFile(kept);
  }

  return projectResult;
}
