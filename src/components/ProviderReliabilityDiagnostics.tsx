import { useMemo } from "react";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import { providerApiKeyPresent } from "@/core/providers/providerDiagnostics";
import {
  getAverageLatency,
  getProviderFailureCount,
  getProviderReliabilitySummary,
  isProviderDegradedForUi,
} from "@/core/providers/reliabilityStore";
import { getActiveCooldowns } from "@/core/providers/reliability";
import { getProviderInfo, PROVIDERS } from "@/core/providers/registry";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";

interface ProviderReliabilityDiagnosticsProps {
  readonly settings: ProviderSettings;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export function ProviderReliabilityDiagnostics({
  settings,
}: ProviderReliabilityDiagnosticsProps) {
  const summary = useMemo(() => getProviderReliabilitySummary(), []);
  const cooldowns = getActiveCooldowns();

  const rows = PROVIDERS.map((p) => {
    const id = p.id as ProviderId;
    const entry = summary.byProvider[id];
    const avgLatency = getAverageLatency(id);
    const failures = getProviderFailureCount(id);
    const degraded = isProviderDegradedForUi(id);
    const inCooldown = cooldowns[id] != null;
    const isBackup = settings.backupProvider === id;

    let status = "Ready";
    if (degraded) status = "Degraded";
    else if (inCooldown) status = "Cooldown";
    else if (!providerApiKeyPresent(settings, id) && id !== "ollama") {
      status = "No key";
    }

    return {
      id,
      label: PROVIDER_DISPLAY_LABELS[id] ?? getProviderInfo(id).label,
      model: modelForProvider(settings, id) || "—",
      apiKey: providerApiKeyPresent(settings, id),
      status,
      degraded,
      isBackup,
      lastSuccess: entry?.lastSuccessAt ?? null,
      lastFailure: entry?.lastFailureAt ?? null,
      lastFailureReason: entry?.lastFailureReason ?? null,
      avgLatency,
      failures,
    };
  });

  return (
    <section className="prov-block">
      <h3 className="prov-heading">Provider reliability</h3>
      <p className="prov-hint">
        Preflight checks, smart retries, circuit breaker, and fallback diagnostics.
        Backup provider:{" "}
        {settings.backupProvider
          ? PROVIDER_DISPLAY_LABELS[settings.backupProvider]
          : "Auto (fallback order)"}
      </p>
      <div className="prov-reliability-grid">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`prov-reliability-card${row.degraded ? " prov-reliability-card--degraded" : ""}`}
          >
            <div className="prov-reliability-card__head">
              <strong>{row.label}</strong>
              <span
                className={`prov-reliability-badge prov-reliability-badge--${row.degraded ? "warn" : row.status === "Ready" ? "ok" : "muted"}`}
              >
                {row.status}
              </span>
            </div>
            <dl className="prov-reliability-dl">
              <div>
                <dt>Model</dt>
                <dd>{row.model}</dd>
              </div>
              <div>
                <dt>API key</dt>
                <dd>{row.apiKey ? "Present" : "Missing"}</dd>
              </div>
              <div>
                <dt>Last success</dt>
                <dd>{formatTime(row.lastSuccess)}</dd>
              </div>
              <div>
                <dt>Last failure</dt>
                <dd>{formatTime(row.lastFailure)}</dd>
              </div>
              <div>
                <dt>Avg latency</dt>
                <dd>{row.avgLatency != null ? `${row.avgLatency} ms` : "—"}</dd>
              </div>
              <div>
                <dt>Failures (5m)</dt>
                <dd>{row.failures}</dd>
              </div>
              {row.isBackup ? (
                <div>
                  <dt>Role</dt>
                  <dd>Backup provider</dd>
                </div>
              ) : null}
              {row.lastFailureReason ? (
                <div className="prov-reliability-dl__full">
                  <dt>Last error</dt>
                  <dd>{row.lastFailureReason}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ))}
      </div>
      <ul className="prov-reliability-stats">
        <li>Retries: {summary.counters.retryCount}</li>
        <li>JSON repairs: {summary.counters.jsonRepairCount}</li>
        <li>Fallbacks: {summary.counters.fallbackCount}</li>
        <li>Rate limits: {summary.counters.rateLimitCount}</li>
      </ul>
    </section>
  );
}
