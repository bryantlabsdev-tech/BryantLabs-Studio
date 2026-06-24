import type { AgentLoopSession } from "@/core/agentLoop";
import type {
  PersistedRunCheckpoint,
  PersistedRunKind,
} from "@/core/runPersistence/types";

const STORAGE_KEY = "bryantlabs.runCheckpoint.v1";
const LEGACY_AGENT_KIND = "cursor_agent" as const;
const LEGACY_AGENT_SESSION_KEY = "cursorAgentSession" as const;

type StoredCheckpointEntry = Omit<PersistedRunCheckpoint, "kind"> & {
  readonly kind?: PersistedRunKind | typeof LEGACY_AGENT_KIND;
} & Partial<Record<typeof LEGACY_AGENT_SESSION_KEY, AgentLoopSession>>;

/** Normalize legacy checkpoint payloads saved before the studio_agent rename. */
export function normalizeCheckpointEntry(
  entry: StoredCheckpointEntry,
): PersistedRunCheckpoint | null {
  if (entry.version !== 1) return null;
  const kind =
    entry.kind === LEGACY_AGENT_KIND ? ("studio_agent" as const) : entry.kind;
  if (!kind) return null;
  const agentLoopSession =
    entry.agentLoopSession ?? entry[LEGACY_AGENT_SESSION_KEY];
  if (kind === "studio_agent" && !agentLoopSession) return null;
  const { [LEGACY_AGENT_SESSION_KEY]: _legacy, ...rest } = entry;
  return {
    ...rest,
    kind,
    ...(agentLoopSession ? { agentLoopSession } : {}),
  };
}

interface StoredRunCheckpoints {
  readonly version: 1;
  readonly entries: StoredCheckpointEntry[];
}

export interface RunCheckpointStorePort {
  load(projectPath: string): Promise<PersistedRunCheckpoint | null>;
  save(checkpoint: PersistedRunCheckpoint): Promise<void>;
  clear(projectPath: string): Promise<void>;
}

let activePort: RunCheckpointStorePort | null = null;
let migrationDone = false;

function readLocalStorageRaw(): StoredRunCheckpoints {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: [] };
    const data = JSON.parse(raw) as StoredRunCheckpoints;
    if (data.version !== 1 || !Array.isArray(data.entries)) {
      return { version: 1, entries: [] };
    }
    return data;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeLocalStorageRaw(entries: PersistedRunCheckpoint[]): void {
  const payload: StoredRunCheckpoints = { version: 1, entries };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function normalizeAllEntries(
  entries: StoredCheckpointEntry[],
): PersistedRunCheckpoint[] {
  return entries
    .map((e) => normalizeCheckpointEntry(e))
    .filter((e): e is PersistedRunCheckpoint => e !== null);
}

export function createLocalStorageRunCheckpointPort(): RunCheckpointStorePort {
  return {
    async load(projectPath) {
      const entry = readLocalStorageRaw().entries.find(
        (e) => e.projectPath === projectPath,
      );
      if (!entry) return null;
      return normalizeCheckpointEntry(entry);
    },
    async save(checkpoint) {
      const all = readLocalStorageRaw()
        .entries.map((e) => normalizeCheckpointEntry(e))
        .filter((e): e is PersistedRunCheckpoint => e !== null)
        .filter((e) => e.projectPath !== checkpoint.projectPath);
      writeLocalStorageRaw([checkpoint, ...all]);
    },
    async clear(projectPath) {
      const kept = readLocalStorageRaw()
        .entries.map((e) => normalizeCheckpointEntry(e))
        .filter((e): e is PersistedRunCheckpoint => e !== null)
        .filter((e) => e.projectPath !== projectPath);
      writeLocalStorageRaw(kept);
    },
  };
}

export function createElectronRunCheckpointPort(
  api: Pick<
    import("@/types").BryantLabsApi,
    "loadRunCheckpoint" | "saveRunCheckpoint" | "clearRunCheckpoint"
  >,
): RunCheckpointStorePort {
  return {
    async load(projectPath) {
      const raw = await api.loadRunCheckpoint(projectPath);
      if (!raw) return null;
      return normalizeCheckpointEntry(raw as StoredCheckpointEntry);
    },
    async save(checkpoint) {
      const result = await api.saveRunCheckpoint(checkpoint);
      if (!result.ok) {
        throw new Error(result.reason ?? "Failed to save run checkpoint.");
      }
    },
    async clear(projectPath) {
      await api.clearRunCheckpoint(projectPath);
    },
  };
}

export function setRunCheckpointStorePort(port: RunCheckpointStorePort | null): void {
  activePort = port;
  migrationDone = false;
}

async function migrateLocalStorageToPort(port: RunCheckpointStorePort): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  const local = normalizeAllEntries(readLocalStorageRaw().entries);
  if (local.length === 0) return;
  for (const checkpoint of local) {
    await port.save(checkpoint);
  }
  writeLocalStorageRaw([]);
}

function getPort(): RunCheckpointStorePort {
  return activePort ?? createLocalStorageRunCheckpointPort();
}

export async function loadRunCheckpointAsync(
  projectPath: string | null,
): Promise<PersistedRunCheckpoint | null> {
  if (!projectPath) return null;
  const port = getPort();
  if (activePort) {
    await migrateLocalStorageToPort(activePort);
  }
  return port.load(projectPath);
}

export async function saveRunCheckpointAsync(
  checkpoint: PersistedRunCheckpoint,
): Promise<void> {
  const port = getPort();
  if (activePort) {
    await migrateLocalStorageToPort(activePort);
  }
  await port.save(checkpoint);
}

export async function clearRunCheckpointAsync(
  projectPath: string | null,
): Promise<void> {
  if (!projectPath) return;
  const port = getPort();
  if (activePort) {
    await migrateLocalStorageToPort(activePort);
  }
  await port.clear(projectPath);
}

/** Synchronous localStorage access (unit tests and non-async callers). */
export function loadRunCheckpoint(
  projectPath: string | null,
): PersistedRunCheckpoint | null {
  if (!projectPath) return null;
  const entry = readLocalStorageRaw().entries.find(
    (e) => e.projectPath === projectPath,
  );
  if (!entry) return null;
  return normalizeCheckpointEntry(entry);
}

export function saveRunCheckpoint(checkpoint: PersistedRunCheckpoint): void {
  if (activePort) {
    void saveRunCheckpointAsync(checkpoint);
    return;
  }
  const all = readLocalStorageRaw()
    .entries.map((e) => normalizeCheckpointEntry(e))
    .filter((e): e is PersistedRunCheckpoint => e !== null)
    .filter((e) => e.projectPath !== checkpoint.projectPath);
  writeLocalStorageRaw([checkpoint, ...all]);
}

export function clearRunCheckpoint(projectPath: string | null): void {
  if (!projectPath) return;
  if (activePort) {
    void clearRunCheckpointAsync(projectPath);
    return;
  }
  const kept = readLocalStorageRaw()
    .entries.map((e) => normalizeCheckpointEntry(e))
    .filter((e): e is PersistedRunCheckpoint => e !== null)
    .filter((e) => e.projectPath !== projectPath);
  writeLocalStorageRaw(kept);
}
