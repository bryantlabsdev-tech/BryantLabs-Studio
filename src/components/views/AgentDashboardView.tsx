import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import {
  computeAgentPerformance,
  computeCostPeriodSummary,
  computeDashboardSummary,
  computeProviderAnalytics,
  computeRepairAnalytics,
  repairReasonLabel,
  REPAIR_REASONS,
} from "@/core/analytics";
import {
  formatCostUsd,
  formatDuration,
  formatPercent,
} from "@/core/analytics/costEstimates";
import type {
  CostPeriod,
  ProviderAnalyticsRow,
  StudioAnalyticsRecord,
} from "@/core/analytics/types";
import { getProviderInfo } from "@/core/providers/registry";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";
import {
  getProviderReliabilitySummary,
  type ProviderReliabilitySummary,
} from "@/core/providers/reliabilityStore";
import { getActiveCooldowns } from "@/core/providers/reliability";
import { mostReferencedMemory } from "@/core/memory/analytics";
import {
  computePipelineAnalytics,
  pipelineRunsForProject,
} from "@/core/pipeline/analytics";
import type { HealthResult, ProviderId } from "@/core/providers/types";

type SortKey = keyof Pick<
  ProviderAnalyticsRow,
  "provider" | "model" | "runs" | "successPercent" | "avgDurationMs" | "estimatedCostUsd"
>;

export function AgentDashboardView() {
  const {
    project,
    analyticsHistory,
    selectedAnalyticsId,
    selectAnalyticsRecord,
    openAnalyticsFromDashboard,
    providerStatus,
    memoryAnalytics,
    agentMemoryStore,
  } = useWorkspace();

  const [providerHealth, setProviderHealth] = useState<
    ReadonlyArray<{ provider: ProviderId; health: HealthResult | null }>
  >([]);
  const [reliabilitySummary, setReliabilitySummary] =
    useState<ProviderReliabilitySummary>(() => getProviderReliabilitySummary());
  const [sortKey, setSortKey] = useState<SortKey>("runs");
  const [sortAsc, setSortAsc] = useState(false);

  const api = window.bryantlabs;

  useEffect(() => {
    if (!api) return;
    const providers: ProviderId[] = [
      "anthropic",
      "gemini",
      "openrouter",
      "groq",
      "ollama",
    ];
    void Promise.all(
      providers.map(async (provider) => {
        try {
          const health = await api.checkProviderHealth(provider);
          return { provider, health };
        } catch {
          return { provider, health: null };
        }
      }),
    ).then(setProviderHealth);
    setReliabilitySummary(getProviderReliabilitySummary());
  }, [api, providerStatus?.lastCheckedAt]);

  const summary = useMemo(
    () => computeDashboardSummary(analyticsHistory),
    [analyticsHistory],
  );

  const providerRows = useMemo(() => {
    const rows = computeProviderAnalytics(analyticsHistory);
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const na = Number(av);
      const nb = Number(bv);
      return sortAsc ? na - nb : nb - na;
    });
  }, [analyticsHistory, sortKey, sortAsc]);

  const repairStats = useMemo(
    () => computeRepairAnalytics(analyticsHistory),
    [analyticsHistory],
  );

  const performance = useMemo(
    () => computeAgentPerformance(analyticsHistory),
    [analyticsHistory],
  );

  const selected = useMemo(
    () =>
      analyticsHistory.find((r) => r.id === selectedAnalyticsId) ??
      analyticsHistory[0] ??
      null,
    [analyticsHistory, selectedAnalyticsId],
  );

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(false);
      return key;
    });
  }, []);

  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to view Agent Dashboard analytics."
      />
    );
  }

  return (
    <div className="agent-dashboard">
      <header className="agent-dashboard__hero">
        <div>
          <h3 className="agent-dashboard__title">Agent Dashboard</h3>
          <p className="plan__muted">
            Studio performance, provider usage, and estimated costs for{" "}
            <code>{project.name}</code>.
          </p>
        </div>
        <div className="agent-dashboard__hero-glow" aria-hidden />
      </header>

      <section className="agent-dashboard__cards">
        <MetricCard label="Total Runs" value={String(summary.totalRuns)} />
        <MetricCard label="Successful Runs" value={String(summary.successfulRuns)} tone="success" />
        <MetricCard label="Failed Runs" value={String(summary.failedRuns)} tone="danger" />
        <MetricCard label="Success Rate" value={formatPercent(summary.successRatePercent)} />
        <MetricCard label="Avg Duration" value={formatDuration(summary.averageRunDurationMs)} />
        <MetricCard label="Total AI Calls" value={String(summary.totalAiCalls)} />
        <MetricCard
          label="Repair Success"
          value={
            summary.repairSuccessRatePercent != null
              ? formatPercent(summary.repairSuccessRatePercent)
              : "—"
          }
        />
        <MetricCard
          label="Est. Total Cost"
          value={formatCostUsd(summary.estimatedTotalCostUsd)}
          highlight
        />
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Multi-agent pipeline</h4>
        <PipelineAnalyticsSection projectPath={project.path} />
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Cost tracking (estimates)</h4>
        <div className="agent-dashboard__cost-grid">
          {(["today", "7d", "30d", "all"] as const).map((period) => (
            <CostPeriodCard
              key={period}
              period={period}
              records={analyticsHistory}
            />
          ))}
        </div>
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Agent performance</h4>
        <div className="agent-dashboard__perf-grid">
          <PerfCard
            label="Fastest provider"
            value={
              performance.fastestProvider
                ? `${PROVIDER_DISPLAY_LABELS[performance.fastestProvider.provider]} · ${formatDuration(performance.fastestProvider.avgDurationMs)}`
                : "—"
            }
          />
          <PerfCard
            label="Most successful provider"
            value={
              performance.mostSuccessfulProvider
                ? `${PROVIDER_DISPLAY_LABELS[performance.mostSuccessfulProvider.provider]} · ${formatPercent(performance.mostSuccessfulProvider.successPercent)}`
                : "—"
            }
          />
          <PerfCard
            label="Most used provider"
            value={
              performance.mostUsedProvider
                ? `${PROVIDER_DISPLAY_LABELS[performance.mostUsedProvider.provider]} · ${performance.mostUsedProvider.runs} runs`
                : "—"
            }
          />
          <PerfCard
            label="Most successful model"
            value={
              performance.mostSuccessfulModel
                ? `${performance.mostSuccessfulModel.model} · ${formatPercent(performance.mostSuccessfulModel.successPercent)}`
                : "—"
            }
          />
        </div>
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Provider health</h4>
        <ul className="agent-dashboard__health-list">
          {providerHealth.map(({ provider, health }) => (
            <li key={provider} className="agent-dashboard__health-item">
              <HealthDot tone={healthTone(health)} />
              <span className="agent-dashboard__health-label">
                {PROVIDER_DISPLAY_LABELS[provider]}
              </span>
              <span className="plan__muted">
                {health?.model || "—"} · {healthStatusLabel(health)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Memory statistics</h4>
        <div className="agent-dashboard__perf-grid">
          <PerfCard label="Total memories" value={String(memoryAnalytics.totalMemories)} />
          <PerfCard label="Memory hits" value={String(memoryAnalytics.hitCount)} />
          <PerfCard label="Memory misses" value={String(memoryAnalytics.missCount)} />
          <PerfCard
            label="Retrieval count"
            value={String(memoryAnalytics.retrievalCount)}
          />
          <PerfCard
            label="Hit rate"
            value={
              memoryAnalytics.hitRatePercent != null
                ? `${memoryAnalytics.hitRatePercent}%`
                : "—"
            }
          />
          <PerfCard
            label="Most referenced"
            value={
              mostReferencedMemory(agentMemoryStore)?.title ??
              "—"
            }
          />
        </div>
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Provider reliability</h4>
        <div className="agent-dashboard__perf-grid">
          <PerfCard
            label="Most reliable provider"
            value={
              reliabilitySummary.mostReliableProvider
                ? PROVIDER_DISPLAY_LABELS[reliabilitySummary.mostReliableProvider]
                : "—"
            }
          />
          <PerfCard
            label="Most failed provider"
            value={
              reliabilitySummary.mostFailedProvider
                ? PROVIDER_DISPLAY_LABELS[reliabilitySummary.mostFailedProvider]
                : "—"
            }
          />
          <PerfCard
            label="Fallbacks used"
            value={String(reliabilitySummary.fallbacksUsed)}
          />
          <PerfCard
            label="Rate limits"
            value={String(reliabilitySummary.counters.rateLimitCount)}
          />
          <PerfCard
            label="Smart retries"
            value={String(reliabilitySummary.counters.retryCount)}
          />
          <PerfCard
            label="Degraded providers"
            value={
              reliabilitySummary.degradedProviders.length
                ? reliabilitySummary.degradedProviders
                    .map((p) => PROVIDER_DISPLAY_LABELS[p])
                    .join(", ")
                : "None"
            }
          />
        </div>
        <ul className="agent-dashboard__repair-reasons">
          <li>
            <span>Provider failures</span>
            <strong>{reliabilitySummary.counters.providerFailureCount}</strong>
          </li>
          <li>
            <span>Invalid key events</span>
            <strong>{reliabilitySummary.counters.invalidKeyCount}</strong>
          </li>
          <li>
            <span>Offline events</span>
            <strong>{reliabilitySummary.counters.offlineCount}</strong>
          </li>
          <li>
            <span>Insufficient credit events</span>
            <strong>{reliabilitySummary.counters.insufficientCreditCount}</strong>
          </li>
        </ul>
        {Object.keys(getActiveCooldowns()).length > 0 ? (
          <>
            <p className="agent-dashboard__label">Current cooldowns</p>
            <ul className="agent-dashboard__file-list">
              {Object.entries(getActiveCooldowns()).map(([provider, until]) => (
                <li key={provider}>
                  {PROVIDER_DISPLAY_LABELS[provider as ProviderId]} until{" "}
                  {new Date(until).toLocaleTimeString()}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Provider analytics</h4>
        {providerRows.length === 0 ? (
          <p className="plan__muted">No provider data yet — complete a Studio run.</p>
        ) : (
          <div className="agent-dashboard__table-wrap">
            <table className="agent-dashboard__table">
              <thead>
                <tr>
                  <SortHeader label="Provider" active={sortKey === "provider"} onClick={() => toggleSort("provider")} />
                  <SortHeader label="Model" active={sortKey === "model"} onClick={() => toggleSort("model")} />
                  <SortHeader label="Runs" active={sortKey === "runs"} onClick={() => toggleSort("runs")} />
                  <SortHeader label="Success %" active={sortKey === "successPercent"} onClick={() => toggleSort("successPercent")} />
                  <SortHeader label="Avg Duration" active={sortKey === "avgDurationMs"} onClick={() => toggleSort("avgDurationMs")} />
                  <SortHeader label="Est. Cost" active={sortKey === "estimatedCostUsd"} onClick={() => toggleSort("estimatedCostUsd")} />
                </tr>
              </thead>
              <tbody>
                {providerRows.map((row) => (
                  <tr key={`${row.provider}-${row.model}`}>
                    <td>{PROVIDER_DISPLAY_LABELS[row.provider]}</td>
                    <td><code>{row.model}</code></td>
                    <td>{row.runs}</td>
                    <td>{formatPercent(row.successPercent)}</td>
                    <td>{formatDuration(row.avgDurationMs)}</td>
                    <td>{formatCostUsd(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="agent-dashboard__section">
        <h4 className="agent-dashboard__heading">Repair analytics</h4>
        <div className="agent-dashboard__repair-grid">
          <MetricCard label="Repairs Attempted" value={String(repairStats.attempted)} compact />
          <MetricCard label="Repairs Successful" value={String(repairStats.successful)} compact tone="success" />
          <MetricCard label="Repairs Failed" value={String(repairStats.failed)} compact tone="danger" />
        </div>
        <ul className="agent-dashboard__repair-reasons">
          {REPAIR_REASONS.map((reason) => (
            <li key={reason}>
              <span>{repairReasonLabel(reason)}</span>
              <strong>{repairStats.byReason[reason]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="agent-dashboard__section agent-dashboard__split">
        <div className="agent-dashboard__history">
          <h4 className="agent-dashboard__heading">Run history</h4>
          {analyticsHistory.length === 0 ? (
            <p className="plan__muted">Runs are recorded automatically after each Studio action.</p>
          ) : (
            <ul className="agent-dashboard__history-list">
              {analyticsHistory.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    className={`agent-dashboard__history-btn${
                      selected?.id === record.id ? " agent-dashboard__history-btn--on" : ""
                    }`}
                    onClick={() => selectAnalyticsRecord(record.id)}
                  >
                    <span className="agent-dashboard__history-time">
                      {new Date(record.at).toLocaleString()}
                    </span>
                    <span className="agent-dashboard__history-meta">
                      {record.actionLabel} · {record.provider ?? "—"} · {record.model ?? "—"}
                    </span>
                    <span className={`agent-dashboard__status agent-dashboard__status--${record.status}`}>
                      {record.status}
                    </span>
                    <span className="plan__muted">
                      {formatDuration(record.durationMs)} · {record.aiCalls} AI calls ·{" "}
                      {record.estimatedTotalTokens.toLocaleString()} tokens
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="agent-dashboard__detail glass-panel">
          {selected ? (
            selected.contextSnapshotId ? (
              <RunDetailPanel
                record={selected}
                onOpenContext={() => openAnalyticsFromDashboard(selected.id)}
              />
            ) : (
              <RunDetailPanel record={selected} />
            )
          ) : (
            <p className="plan__muted">Select a run to view details.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  highlight,
  compact,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`agent-dashboard__card${highlight ? " agent-dashboard__card--highlight" : ""}${
        compact ? " agent-dashboard__card--compact" : ""
      }${tone ? ` agent-dashboard__card--${tone}` : ""}`}
    >
      <span className="agent-dashboard__card-label">{label}</span>
      <span className="agent-dashboard__card-value">{value}</span>
    </div>
  );
}

function CostPeriodCard({
  period,
  records,
}: {
  period: CostPeriod;
  records: readonly StudioAnalyticsRecord[];
}) {
  const labels: Record<CostPeriod, string> = {
    today: "Today",
    "7d": "7 Days",
    "30d": "30 Days",
    all: "All Time",
  };
  const stats = computeCostPeriodSummary(records, period);
  return (
    <div className="agent-dashboard__cost-card glass-panel">
      <span className="agent-dashboard__card-label">{labels[period]}</span>
      <strong>{formatCostUsd(stats.estimatedCostUsd)}</strong>
      <span className="plan__muted">
        {stats.runs} runs · {stats.promptTokens.toLocaleString()} prompt ·{" "}
        {stats.outputTokens.toLocaleString()} output tokens
      </span>
    </div>
  );
}

function PerfCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="agent-dashboard__perf-card glass-panel">
      <span className="agent-dashboard__card-label">{label}</span>
      <span className="agent-dashboard__perf-value">{value}</span>
    </div>
  );
}

function SortHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th>
      <button
        type="button"
        className={`agent-dashboard__sort${active ? " agent-dashboard__sort--on" : ""}`}
        onClick={onClick}
      >
        {label}
      </button>
    </th>
  );
}

function HealthDot({ tone }: { tone: "green" | "yellow" | "red" }) {
  return <span className={`agent-dashboard__health-dot agent-dashboard__health-dot--${tone}`} />;
}

function healthTone(health: HealthResult | null): "green" | "yellow" | "red" {
  if (!health) return "yellow";
  if (health.ok && health.connectionStatus === "connected") return "green";
  if (health.connectionStatus === "offline") return "red";
  return "yellow";
}

function healthStatusLabel(health: HealthResult | null): string {
  if (!health) return "Not checked";
  if (health.ok) return "Online";
  if (health.connectionStatus === "offline") return "Offline";
  if (health.connectionStatus === "rate_limited") return "Rate limited";
  if (health.connectionStatus === "invalid_key") return "Invalid key";
  return health.error ?? "Unhealthy";
}

function RunDetailPanel({
  record,
  onOpenContext,
}: {
  record: StudioAnalyticsRecord;
  onOpenContext?: () => void;
}) {
  return (
    <>
      <h4 className="agent-dashboard__heading">{record.actionLabel}</h4>
      <p className={`agent-dashboard__status agent-dashboard__status--${record.status}`}>
        {record.status} · {record.summary}
      </p>

      <dl className="agent-dashboard__facts">
        <Fact label="Date" value={new Date(record.at).toLocaleString()} />
        <Fact label="Provider" value={record.provider ? getProviderInfo(record.provider).label : "—"} />
        <Fact label="Model" value={record.model ?? "—"} />
        <Fact label="Duration" value={formatDuration(record.durationMs)} />
        <Fact label="AI Calls" value={String(record.aiCalls)} />
        <Fact
          label="Tokens (est.)"
          value={`${record.estimatedPromptTokens.toLocaleString()} prompt · ${record.estimatedOutputTokens.toLocaleString()} output`}
        />
        <Fact label="Est. Cost" value={formatCostUsd(record.estimatedCostUsd)} />
      </dl>

      {record.prompt ? (
        <>
          <p className="agent-dashboard__label">Prompt</p>
          <pre className="agent-dashboard__pre">{record.prompt}</pre>
        </>
      ) : null}

      {record.selectedFiles && record.selectedFiles.length > 0 ? (
        <>
          <p className="agent-dashboard__label">Selected / modified files</p>
          <ul className="agent-dashboard__file-list">
            {record.selectedFiles.map((f) => (
              <li key={f}><code>{f}</code></li>
            ))}
          </ul>
        </>
      ) : null}

      {record.verification ? (
        <>
          <p className="agent-dashboard__label">Verification</p>
          <div className="agent-dashboard__verify-row">
            <VerifyPill label="TypeScript" ok={record.verification.typecheckOk} />
            <VerifyPill label="Build" ok={record.verification.buildOk} />
            <VerifyPill label="Tests" ok={record.verification.testsOk} />
          </div>
        </>
      ) : null}

      {record.repair ? (
        <>
          <p className="agent-dashboard__label">Repair</p>
          <p className="plan__muted">
            {record.repair.attempted} attempted · {record.repair.successful} successful ·{" "}
            {record.repair.failed} failed
          </p>
        </>
      ) : null}

      {onOpenContext ? (
        <div className="agent-dashboard__actions">
          <button type="button" className="prov-btn prov-btn--primary" onClick={onOpenContext}>
            Open in Context Inspector
          </button>
        </div>
      ) : null}
    </>
  );
}

function PipelineAnalyticsSection({ projectPath }: { projectPath: string }) {
  const stats = useMemo(() => {
    const runs = pipelineRunsForProject(projectPath);
    return computePipelineAnalytics(runs);
  }, [projectPath]);

  return (
    <div className="agent-dashboard__cards">
      <MetricCard label="Pipeline runs" value={String(stats.totalRuns)} />
      <MetricCard
        label="Pipeline success rate"
        value={formatPercent(stats.successRatePercent)}
        tone="success"
      />
      <MetricCard
        label="Repair success rate"
        value={
          stats.repairSuccessRatePercent != null
            ? formatPercent(stats.repairSuccessRatePercent)
            : "—"
        }
      />
      <MetricCard
        label="Avg pipeline duration"
        value={formatDuration(stats.averageDurationMs)}
      />
      <MetricCard
        label="Avg planner stage"
        value={formatDuration(stats.averageStageDurationMs.planner ?? null)}
      />
      <MetricCard
        label="Avg coder stage"
        value={formatDuration(stats.averageStageDurationMs.coder ?? null)}
      />
      <MetricCard
        label="Avg verifier stage"
        value={formatDuration(stats.averageStageDurationMs.verifier ?? null)}
      />
      <MetricCard
        label="Avg repair stage"
        value={formatDuration(stats.averageStageDurationMs.repair ?? null)}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function VerifyPill({ label, ok }: { label: string; ok: boolean | null }) {
  const tone = ok === null ? "unknown" : ok ? "pass" : "fail";
  const text = ok === null ? "—" : ok ? "Pass" : "Fail";
  return (
    <span className={`agent-dashboard__verify agent-dashboard__verify--${tone}`}>
      {label}: {text}
    </span>
  );
}
