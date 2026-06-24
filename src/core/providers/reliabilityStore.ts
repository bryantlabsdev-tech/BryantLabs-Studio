import type { ProviderId } from "@/core/providers/types";
import type { ProviderReliabilityStatus } from "@/core/providers/reliability";
import { getActiveCooldowns } from "@/core/providers/reliability";
import {
  getDegradedProviders,
  getProviderDegradedUntil,
  getProviderFailureCountInWindow,
} from "@/core/providers/circuitBreaker";

const STORAGE_KEY = "bryantlabs.providerReliability.v2";
const LEGACY_STORAGE_KEY = "bryantlabs.providerReliability.v1";

export interface ProviderReliabilityCounters {
  rateLimitCount: number;
  fallbackCount: number;
  providerFailureCount: number;
  invalidKeyCount: number;
  offlineCount: number;
  insufficientCreditCount: number;
  retryCount: number;
  jsonRepairCount: number;
  failuresByProvider: Partial<Record<ProviderId, number>>;
  successesByProvider: Partial<Record<ProviderId, number>>;
}

export interface ProviderDiagnosticsEntry {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  totalLatencyMs: number;
  latencySampleCount: number;
}

export interface ProviderReliabilityState {
  counters: ProviderReliabilityCounters;
  byProvider: Partial<Record<ProviderId, ProviderDiagnosticsEntry>>;
}

export interface ProviderReliabilitySummary {
  readonly counters: ProviderReliabilityCounters;
  readonly mostReliableProvider: ProviderId | null;
  readonly mostFailedProvider: ProviderId | null;
  readonly fallbacksUsed: number;
  readonly cooldowns: Readonly<Partial<Record<ProviderId, number>>>;
  readonly degradedProviders: readonly ProviderId[];
  readonly byProvider: Partial<Record<ProviderId, ProviderDiagnosticsEntry>>;
}

function emptyCounters(): ProviderReliabilityCounters {
  return {
    rateLimitCount: 0,
    fallbackCount: 0,
    providerFailureCount: 0,
    invalidKeyCount: 0,
    offlineCount: 0,
    insufficientCreditCount: 0,
    retryCount: 0,
    jsonRepairCount: 0,
    failuresByProvider: {},
    successesByProvider: {},
  };
}

function emptyState(): ProviderReliabilityState {
  return { counters: emptyCounters(), byProvider: {} };
}

function readState(): ProviderReliabilityState {
  if (typeof localStorage === "undefined") return emptyState();
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<ProviderReliabilityState>;
    return {
      counters: { ...emptyCounters(), ...parsed.counters },
      byProvider: parsed.byProvider ?? {},
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: ProviderReliabilityState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function bumpProvider(
  map: Partial<Record<ProviderId, number>>,
  provider: ProviderId,
): Partial<Record<ProviderId, number>> {
  return { ...map, [provider]: (map[provider] ?? 0) + 1 };
}

function touchProviderEntry(
  byProvider: Partial<Record<ProviderId, ProviderDiagnosticsEntry>>,
  provider: ProviderId,
): ProviderDiagnosticsEntry {
  return (
    byProvider[provider] ?? {
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: null,
      totalLatencyMs: 0,
      latencySampleCount: 0,
    }
  );
}

export function recordProviderReliabilityEvent(opts: {
  status:
    | ProviderReliabilityStatus
    | "success"
    | "fallback_selected"
    | "fallback_cancelled"
    | "retry"
    | "json_repair";
  provider: ProviderId;
  latencyMs?: number;
  failureReason?: string;
}): void {
  const state = readState();
  const counters = { ...state.counters };
  const byProvider = { ...state.byProvider };
  const { status, provider } = opts;

  if (status === "success") {
    counters.successesByProvider = bumpProvider(counters.successesByProvider, provider);
    const entry = touchProviderEntry(byProvider, provider);
    byProvider[provider] = {
      ...entry,
      lastSuccessAt: new Date().toISOString(),
      ...(opts.latencyMs != null
        ? {
            totalLatencyMs: entry.totalLatencyMs + opts.latencyMs,
            latencySampleCount: entry.latencySampleCount + 1,
          }
        : {}),
    };
    writeState({ counters, byProvider });
    return;
  }

  if (status === "fallback_selected") {
    counters.fallbackCount += 1;
    writeState({ counters, byProvider });
    return;
  }

  if (status === "fallback_cancelled") {
    writeState({ counters, byProvider });
    return;
  }

  if (status === "retry") {
    counters.retryCount += 1;
    writeState({ counters, byProvider });
    return;
  }

  if (status === "json_repair") {
    counters.jsonRepairCount += 1;
    writeState({ counters, byProvider });
    return;
  }

  counters.providerFailureCount += 1;
  counters.failuresByProvider = bumpProvider(counters.failuresByProvider, provider);
  const entry = touchProviderEntry(byProvider, provider);
  byProvider[provider] = {
    ...entry,
    lastFailureAt: new Date().toISOString(),
    lastFailureReason: opts.failureReason ?? status,
  };

  switch (status) {
    case "rate_limited":
      counters.rateLimitCount += 1;
      break;
    case "invalid_key":
    case "missing_key":
      counters.invalidKeyCount += 1;
      break;
    case "offline":
    case "model_missing":
      counters.offlineCount += 1;
      break;
    case "insufficient_credits":
      counters.insufficientCreditCount += 1;
      break;
    default:
      break;
  }

  writeState({ counters, byProvider });
}

export function getAverageLatency(provider: ProviderId): number | null {
  const entry = readState().byProvider[provider];
  if (!entry || entry.latencySampleCount === 0) return null;
  return Math.round(entry.totalLatencyMs / entry.latencySampleCount);
}

export function getProviderReliabilitySummary(): ProviderReliabilitySummary {
  const state = readState();
  const counters = state.counters;
  const providers: ProviderId[] = [
    "gemini",
    "anthropic",
    "openrouter",
    "groq",
    "ollama",
  ];

  let mostReliableProvider: ProviderId | null = null;
  let bestScore = -1;
  let mostFailedProvider: ProviderId | null = null;
  let worstFailures = -1;

  for (const id of providers) {
    const successes = counters.successesByProvider[id] ?? 0;
    const failures = counters.failuresByProvider[id] ?? 0;
    const score = successes - failures;
    if (successes + failures > 0 && score > bestScore) {
      bestScore = score;
      mostReliableProvider = id;
    }
    if (failures > worstFailures) {
      worstFailures = failures;
      mostFailedProvider = id;
    }
  }

  return {
    counters,
    mostReliableProvider,
    mostFailedProvider,
    fallbacksUsed: counters.fallbackCount,
    cooldowns: getActiveCooldowns(),
    degradedProviders: getDegradedProviders(),
    byProvider: state.byProvider,
  };
}

export function resetProviderReliabilityCounters(): void {
  writeState(emptyState());
}

export function isProviderDegradedForUi(provider: ProviderId): boolean {
  return getProviderDegradedUntil(provider) != null;
}

export function getProviderFailureCount(provider: ProviderId): number {
  return getProviderFailureCountInWindow(provider);
}
