import type { ProviderId } from "@/core/providers/types";

const STORAGE_KEY = "bryantlabs.providerCircuit.v1";
const FAILURE_WINDOW_MS = 5 * 60_000;
const FAILURE_THRESHOLD = 3;
const DEGRADED_DURATION_MS = 5 * 60_000;

interface CircuitRecord {
  readonly failureTimestamps: readonly number[];
  readonly degradedUntil: number | null;
}

type CircuitStore = Partial<Record<ProviderId, CircuitRecord>>;

let memoryStore: CircuitStore = {};

function readStore(): CircuitStore {
  if (typeof localStorage === "undefined") return memoryStore;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CircuitStore;
  } catch {
    return {};
  }
}

function writeStore(store: CircuitStore): void {
  if (typeof localStorage === "undefined") {
    memoryStore = store;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function resetProviderCircuit(provider?: ProviderId): void {
  if (provider) {
    const store = readStore();
    delete store[provider];
    writeStore(store);
    return;
  }
  memoryStore = {};
  writeStore({});
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

function pruneFailures(timestamps: readonly number[], now: number): number[] {
  const cutoff = now - FAILURE_WINDOW_MS;
  return timestamps.filter((t) => t >= cutoff);
}

export function recordProviderCircuitFailure(provider: ProviderId): void {
  const now = Date.now();
  const store = readStore();
  const prev = store[provider] ?? { failureTimestamps: [], degradedUntil: null };
  const failures = [...pruneFailures(prev.failureTimestamps, now), now];
  const degradedUntil =
    failures.length >= FAILURE_THRESHOLD ? now + DEGRADED_DURATION_MS : prev.degradedUntil;
  store[provider] = { failureTimestamps: failures, degradedUntil };
  writeStore(store);
}

export function recordProviderCircuitSuccess(provider: ProviderId): void {
  const store = readStore();
  if (!store[provider]) return;
  store[provider] = { failureTimestamps: [], degradedUntil: null };
  writeStore(store);
}

export function isProviderDegraded(provider: ProviderId, now = Date.now()): boolean {
  const record = readStore()[provider];
  if (!record?.degradedUntil) return false;
  if (record.degradedUntil <= now) {
    recordProviderCircuitSuccess(provider);
    return false;
  }
  return true;
}

export function getProviderDegradedUntil(provider: ProviderId): number | null {
  const until = readStore()[provider]?.degradedUntil ?? null;
  if (until == null || until <= Date.now()) return null;
  return until;
}

export function getDegradedProviders(now = Date.now()): readonly ProviderId[] {
  const store = readStore();
  const out: ProviderId[] = [];
  for (const id of Object.keys(store) as ProviderId[]) {
    if (isProviderDegraded(id, now)) out.push(id);
  }
  return out;
}

export function getProviderFailureCountInWindow(
  provider: ProviderId,
  now = Date.now(),
): number {
  const record = readStore()[provider];
  if (!record) return 0;
  return pruneFailures(record.failureTimestamps, now).length;
}
