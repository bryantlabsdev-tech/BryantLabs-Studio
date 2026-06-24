import { providersForHealthCheck } from "@/app/orchestration/studioActionGuards";
import type { ProviderInvokeOrchestrationHost } from "@/app/orchestration/providerInvokeTypes";
import { emptyRunAnalyticsAccumulator } from "@/core/analytics/recordRun";
import {
  configureGreenfieldCallReservations,
  configureMultiPhaseGreenfieldCallReservations,
} from "@/core/providers/greenfieldCallBudget";
import {
  healthToReliabilityStatus,
  mergeProviderHealthResults,
  type ProviderReliabilityStatus,
} from "@/core/providers/reliability";
import { recordProviderReliabilityEvent } from "@/core/providers/reliabilityStore";
import { buildProviderStatusSnapshot } from "@/core/providers/providerStatus";
import type { AiCallLogEntry, AiCallGatePurpose } from "@/core/providers/costControls";
import type { ProviderFallbackRequest } from "@/core/providers/costControls";
import type { ProviderFallbackChoice } from "@/core/providers/reliability";
import {
  invokeStageProvider,
  type ProviderReliabilityLogEvent,
  type StageProviderResult,
} from "@/core/providers/stageInvoke";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { HealthResult } from "@/core/providers/types";
import { studioEventBus } from "@/core/console/studioEventBus";

export function resetAiCallTrackerOrchestration(
  host: ProviderInvokeOrchestrationHost | null,
): void {
  if (!host) return;
  host.aiCallTrackerRef.current.reset();
  host.currentRunAnalyticsRef.current = emptyRunAnalyticsAccumulator();
  host.lastRecordedAnalyticsKeyRef.current = null;
}

export function logAiCallEntryOrchestration(
  host: ProviderInvokeOrchestrationHost | null,
  entry: AiCallLogEntry,
  details: string,
): void {
  if (!host) return;
  host.currentRunAnalyticsRef.current = {
    ...host.currentRunAnalyticsRef.current,
    aiCalls: [...host.currentRunAnalyticsRef.current.aiCalls, entry],
  };
  host.appendGreenfieldRunLog(
    "ai_call",
    entry.ok ? "success" : "failed",
    `${entry.stage} · ${entry.provider} · ${entry.model}`,
    details,
  );
}

export function logProviderReliabilityOrchestration(
  host: ProviderInvokeOrchestrationHost | null,
  event: ProviderReliabilityLogEvent,
  opts?: { skipRunLog?: boolean },
): void {
  if (!host) return;
  if (!opts?.skipRunLog) {
    const stage =
      event.kind === "provider_funds_issue"
        ? "provider_call"
        : event.kind === "provider_preflight" || event.kind === "provider_retry"
          ? "provider_call"
          : event.kind;
    const status =
      event.status === "success" ||
      event.status === "online" ||
      event.status === "checked"
        ? "success"
        : event.status === "started" || event.status === "offered"
          ? "running"
          : "failed";
    host.appendGreenfieldRunLog(
      stage,
      status,
      `[${event.kind}] ${event.status}`,
      event.details ?? event.message,
    );
  }

  if (event.kind === "provider_fallback") {
    studioEventBus.emit({
      type: "provider.fallback",
      timestamp: Date.now(),
      projectPath: null,
      action:
        event.status === "selected"
          ? "selected"
          : event.status === "cancelled"
            ? "cancelled"
            : event.status === "offered"
              ? "offered"
              : "escalated",
      ...(event.provider ? { toProvider: event.provider } : {}),
      ...(event.details ?? event.message ? { reason: event.details ?? event.message } : {}),
    });
  }

  if (!event.provider) return;
  if (event.kind === "provider_call" && event.status === "success") {
    recordProviderReliabilityEvent({
      status: "success",
      provider: event.provider,
    });
    return;
  }
  if (event.kind === "provider_retry") {
    recordProviderReliabilityEvent({
      status: "retry",
      provider: event.provider,
    });
    return;
  }
  if (event.kind === "provider_fallback" && event.status === "selected") {
    recordProviderReliabilityEvent({
      status: "fallback_selected",
      provider: event.provider,
    });
    return;
  }
  if (event.kind === "provider_fallback" && event.status === "cancelled") {
    recordProviderReliabilityEvent({
      status: "fallback_cancelled",
      provider: event.provider,
    });
    return;
  }
  if (event.kind === "provider_call" || event.kind === "provider_funds_issue") {
    if (event.status !== "started" && event.status !== "success") {
      recordProviderReliabilityEvent({
        status: event.status as ProviderReliabilityStatus,
        provider: event.provider,
      });
    }
  }
}

export function promptProviderFallbackOrchestration(
  host: ProviderInvokeOrchestrationHost | null,
  request: ProviderFallbackRequest,
): Promise<ProviderFallbackChoice> {
  if (!host) return Promise.resolve("cancel");
  return new Promise((resolve) => {
    host.fallbackResolverRef.current = resolve;
    host.setProviderFallbackRequest(request);
  });
}

export function resolveProviderFallbackChoiceOrchestration(
  host: ProviderInvokeOrchestrationHost | null,
  choice: ProviderFallbackChoice,
): void {
  if (!host) return;
  host.setProviderFallbackRequest(null);
  const resolve = host.fallbackResolverRef.current;
  host.fallbackResolverRef.current = null;
  resolve?.(choice);
}

async function invokeStageCallOrchestration<T extends StageProviderResult>(
  host: ProviderInvokeOrchestrationHost | null,
  stage: "planner" | "coder" | "repair",
  settings: ProviderSettings,
  estimatedTokens: number,
  call: (provider: ProviderId) => Promise<T>,
  extras?: {
    promptPayload?: string;
    patchSize?: "small" | "large";
    skipSmartRetry?: boolean;
  },
): Promise<T | null> {
  if (!host) return null;
  return invokeStageProvider({
    settings,
    stage,
    tracker: host.aiCallTrackerRef.current,
    estimatedTokens,
    call,
    onLog: (entry, details) => logAiCallEntryOrchestration(host, entry, details),
    onBudgetExceeded: (reason) => {
      host.appendGreenfieldRunLog("provider", "failed", reason);
    },
    onReliabilityLog: (event) => logProviderReliabilityOrchestration(host, event),
    onFallback: (request) => promptProviderFallbackOrchestration(host, request),
    healthByProvider: host.providerHealthCacheRef.current,
    ...(extras?.promptPayload ? { promptPayload: extras.promptPayload } : {}),
    ...(extras?.patchSize ? { patchSize: extras.patchSize } : {}),
    ...(extras?.skipSmartRetry ? { skipSmartRetry: extras.skipSmartRetry } : {}),
  });
}

export function invokePlannerCallOrchestration<T extends StageProviderResult>(
  host: ProviderInvokeOrchestrationHost | null,
  settings: ProviderSettings,
  estimatedTokens: number,
  call: (provider: ProviderId) => Promise<T>,
): Promise<T | null> {
  return invokeStageCallOrchestration(host, "planner", settings, estimatedTokens, call);
}

export function invokeCoderCallOrchestration<T extends StageProviderResult>(
  host: ProviderInvokeOrchestrationHost | null,
  settings: ProviderSettings,
  estimatedTokens: number,
  call: (provider: ProviderId) => Promise<T>,
  extras?: {
    promptPayload?: string;
    patchSize?: "small" | "large";
    skipSmartRetry?: boolean;
  },
): Promise<T | null> {
  return invokeStageCallOrchestration(
    host,
    "coder",
    settings,
    estimatedTokens,
    call,
    extras,
  );
}

export function invokeRepairCallOrchestration<T extends StageProviderResult>(
  host: ProviderInvokeOrchestrationHost | null,
  settings: ProviderSettings,
  estimatedTokens: number,
  call: (provider: ProviderId) => Promise<T>,
  extras?: { promptPayload?: string; patchSize?: "small" | "large" },
): Promise<T | null> {
  return invokeStageCallOrchestration(host, "repair", settings, estimatedTokens, call, extras);
}

export function invokeGreenfieldCallOrchestration<T extends StageProviderResult>(
  host: ProviderInvokeOrchestrationHost | null,
  settings: ProviderSettings,
  estimatedTokens: number,
  call: (provider: ProviderId) => Promise<T>,
  promptPayload?: string,
  recordPurpose: AiCallGatePurpose = "primary",
): Promise<T | null> {
  if (!host) return Promise.resolve(null);
  if (host.providerInvokeStopRef) host.providerInvokeStopRef.current = null;
  if (host.providerRequestSentRef) host.providerRequestSentRef.current = false;
  configureGreenfieldCallReservations(host.aiCallTrackerRef.current, settings);
  return invokeStageProvider({
    settings,
    stage: "greenfield",
    tracker: host.aiCallTrackerRef.current,
    estimatedTokens,
    call,
    recordPurpose,
    onLog: (entry, details) => logAiCallEntryOrchestration(host, entry, details),
    onBudgetExceeded: (reason) => {
      if (host.providerInvokeStopRef) host.providerInvokeStopRef.current = reason;
      host.appendGreenfieldRunLog("provider", "failed", reason);
    },
    onReliabilityLog: (event) => {
      if (
        event.kind === "provider_call" &&
        event.status === "started" &&
        host.providerRequestSentRef
      ) {
        host.providerRequestSentRef.current = true;
      }
      logProviderReliabilityOrchestration(host, event);
    },
    onFallback: (request) => promptProviderFallbackOrchestration(host, request),
    healthByProvider: host.providerHealthCacheRef.current,
    ...(promptPayload ? { promptPayload } : {}),
  });
}

export function invokeGreenfieldRawCallOrchestration<T extends StageProviderResult>(
  host: ProviderInvokeOrchestrationHost | null,
  settings: ProviderSettings,
  estimatedTokens: number,
  call: (provider: ProviderId) => Promise<T>,
  promptPayload?: string,
  recordPurpose: AiCallGatePurpose = "primary",
): Promise<T | null> {
  if (!host) return Promise.resolve(null);
  if (host.providerInvokeStopRef) host.providerInvokeStopRef.current = null;
  if (host.providerRequestSentRef) host.providerRequestSentRef.current = false;
  configureMultiPhaseGreenfieldCallReservations(host.aiCallTrackerRef.current, settings);
  return invokeStageProvider({
    settings,
    stage: "greenfield",
    tracker: host.aiCallTrackerRef.current,
    estimatedTokens,
    call,
    recordPurpose,
    onLog: (entry, details) => logAiCallEntryOrchestration(host, entry, details),
    onBudgetExceeded: (reason) => {
      if (host.providerInvokeStopRef) host.providerInvokeStopRef.current = reason;
      host.appendGreenfieldRunLog("provider", "failed", reason);
    },
    onReliabilityLog: (event) => {
      if (
        event.kind === "provider_call" &&
        event.status === "started" &&
        host.providerRequestSentRef
      ) {
        host.providerRequestSentRef.current = true;
      }
      logProviderReliabilityOrchestration(host, event);
    },
    onFallback: (request) => promptProviderFallbackOrchestration(host, request),
    healthByProvider: host.providerHealthCacheRef.current,
    ...(promptPayload ? { promptPayload } : {}),
  });
}

export function invokeGreenfieldReservedCompletionOrchestration<T extends StageProviderResult>(
  host: ProviderInvokeOrchestrationHost | null,
  settings: ProviderSettings,
  estimatedTokens: number,
  call: (provider: ProviderId) => Promise<T>,
  promptPayload?: string,
): Promise<T | null> {
  if (!host) return Promise.resolve(null);
  if (host.providerInvokeStopRef) host.providerInvokeStopRef.current = null;
  if (host.providerRequestSentRef) host.providerRequestSentRef.current = false;
  configureGreenfieldCallReservations(host.aiCallTrackerRef.current, settings);
  return invokeStageProvider({
    settings,
    stage: "greenfield",
    budgetStage: "repair",
    tracker: host.aiCallTrackerRef.current,
    estimatedTokens,
    call,
    recordPurpose: "primary",
    skipSmartRetry: true,
    onLog: (entry, details) => logAiCallEntryOrchestration(host, entry, details),
    onBudgetExceeded: (reason) => {
      if (host.providerInvokeStopRef) host.providerInvokeStopRef.current = reason;
      host.appendGreenfieldRunLog("provider", "failed", reason);
    },
    onReliabilityLog: (event) => {
      if (
        event.kind === "provider_call" &&
        event.status === "started" &&
        host.providerRequestSentRef
      ) {
        host.providerRequestSentRef.current = true;
      }
      logProviderReliabilityOrchestration(host, event);
    },
    onFallback: (request) => promptProviderFallbackOrchestration(host, request),
    healthByProvider: host.providerHealthCacheRef.current,
    ...(promptPayload ? { promptPayload } : {}),
  });
}

export async function refreshProviderStatusOrchestration(
  host: ProviderInvokeOrchestrationHost | null,
  opts?: { logToRun?: boolean },
): Promise<void> {
  if (!host?.api || host.providerHealthInFlightRef.current) return;
  host.providerHealthInFlightRef.current = true;
  let settings: ProviderSettings;
  try {
    settings = await host.api.getProviderSettings();
  } catch {
    host.providerHealthInFlightRef.current = false;
    return;
  }
  host.setProviderStatus(
    buildProviderStatusSnapshot({
      settings,
      health: null,
      checking: true,
    }),
  );
  const checkedAt = new Date().toISOString();
  const targets = providersForHealthCheck(settings);
  try {
    if (opts?.logToRun) {
      logProviderReliabilityOrchestration(
        host,
        {
          kind: "provider_health",
          status: "checked",
          message: targets.join(", "),
        },
        { skipRunLog: false },
      );
    }
    const results = await Promise.all(
      targets.map(async (provider) => {
        try {
          const health = await host.api!.checkProviderHealth(provider);
          return { provider, health };
        } catch {
          return { provider, health: null };
        }
      }),
    );
    const healthByProvider: Partial<Record<ProviderId, HealthResult>> = {};
    for (const { provider, health } of results) {
      const merged = mergeProviderHealthResults(
        host.providerHealthCacheRef.current[provider] ?? null,
        health,
      );
      if (merged) healthByProvider[provider] = merged;
      if (opts?.logToRun) {
        const rel = healthToReliabilityStatus(health, settings, provider);
        logProviderReliabilityOrchestration(host, {
          kind: "provider_health",
          status: rel,
          message: provider,
          provider,
          ...(health?.error ? { details: health.error } : {}),
        });
      }
    }
    host.providerHealthCacheRef.current = healthByProvider;
    const primaryHealth =
      healthByProvider[settings.provider] ?? results[0]?.health ?? null;
    host.setProviderStatus(
      buildProviderStatusSnapshot({
        settings,
        health: primaryHealth,
        healthByProvider,
        checking: false,
        lastCheckedAt: checkedAt,
      }),
    );
  } catch {
    host.setProviderStatus(
      buildProviderStatusSnapshot({
        settings,
        health: null,
        checking: false,
        lastCheckedAt: checkedAt,
      }),
    );
  } finally {
    host.providerHealthInFlightRef.current = false;
  }
}
