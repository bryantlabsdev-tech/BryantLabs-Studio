import { useCallback, useMemo, useState } from "react";
import {
  buildPipelineInspectorViewModel,
  pipelineStatusGlyph,
  type PipelineStageDiagnostics,
  type PipelineStageId,
  type PipelineStageStatus,
} from "@/core/diagnostics/pipelineInspector";
import {
  useDeveloperDiagnosticsEnabled,
} from "@/core/diagnostics/developerDiagnostics";
import {
  formatBytesShort,
  formatTruncationSource,
  isTransportProblem,
  summarizeTransportLog,
  type ProviderTransportEvent,
} from "@/core/diagnostics/providerTransport";
import { useProviderTransportLog } from "@/core/diagnostics/useProviderTransportLog";
import type { PlanApplySession } from "@/core/planApply";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { EmptyState } from "@/components/EmptyState";
import { readEditPhasePlanForProject } from "@/core/editPhases/ui";
import { useWorkspace } from "@/app/WorkspaceProvider";

interface PipelineInspectorPanelProps {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly planApplySession?: PlanApplySession | null;
}

function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function statusClass(status: PipelineStageStatus): string {
  return `pipeline-inspector__status--${status}`;
}

function MetricChip({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="pipeline-inspector__metric">
      <span className="pipeline-inspector__metric-label">{label}</span>
      <span className="pipeline-inspector__metric-value">{value}</span>
    </div>
  );
}

function StageDetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
}) {
  if (!value?.trim()) return null;
  return (
    <div className="pipeline-inspector__detail-row">
      <span className="pipeline-inspector__detail-label">{label}</span>
      <span className="pipeline-inspector__detail-value">{value}</span>
    </div>
  );
}

function TransportRow({ event }: { readonly event: ProviderTransportEvent }) {
  const problem = isTransportProblem(event);
  const writeMismatch = event.bytesWritten !== event.payloadByteLength;
  return (
    <article
      className={`pipeline-inspector__transport-row${problem ? " pipeline-inspector__transport-row--problem" : ""}`}
      data-testid="transport-event"
      data-attempt={event.attempt}
      data-truncation={event.truncationSource}
    >
      <header className="pipeline-inspector__transport-head">
        <span className="pipeline-inspector__transport-badge">
          attempt {event.attempt}
        </span>
        <span className="pipeline-inspector__transport-host">{event.urlHost}</span>
        <span className="pipeline-inspector__transport-meta">
          {formatDuration(event.durationMs)}
          {event.httpStatus != null ? ` · HTTP ${event.httpStatus}` : ""}
        </span>
        <span
          className={`pipeline-inspector__transport-verdict${problem ? " pipeline-inspector__transport-verdict--bad" : " pipeline-inspector__transport-verdict--ok"}`}
        >
          {formatTruncationSource(event.truncationSource)}
        </span>
      </header>
      <div className="pipeline-inspector__detail-grid">
        <StageDetailRow label="Request ID" value={event.requestId} />
        <StageDetailRow label="Provider request ID" value={event.providerRequestId} />
        <StageDetailRow
          label="Payload"
          value={`${formatBytesShort(event.payloadByteLength)} · sha ${event.payloadSha256}`}
        />
        <StageDetailRow
          label="Bytes written"
          value={`${formatBytesShort(event.bytesWritten)}${writeMismatch ? " ⚠ mismatch" : ""}`}
        />
        <StageDetailRow
          label="Content-Length"
          value={String(event.contentLengthHeader)}
        />
        <StageDetailRow
          label="Transfer-Encoding"
          value={event.transferEncoding ?? "identity"}
        />
        <StageDetailRow
          label="Response"
          value={`${formatBytesShort(event.responseByteLength)} · sha ${event.responseSha256}`}
        />
        <StageDetailRow label="Parser stage" value={event.parserStage} />
        <StageDetailRow
          label="Local JSON.parse"
          value={event.localJsonParse ?? null}
        />
        <StageDetailRow
          label="Schema"
          value={event.schemaResult ?? null}
        />
        <StageDetailRow
          label="Serializer"
          value={event.serializer ?? null}
        />
        <StageDetailRow
          label="Top-level keys"
          value={event.topLevelKeys?.join(", ") ?? null}
        />
        <StageDetailRow
          label="Content blocks"
          value={
            event.contentBlockTypes
              ? JSON.stringify(event.contentBlockTypes)
              : null
          }
        />
        <StageDetailRow
          label="Hash triad"
          value={
            event.hashBeforeValidation ||
            event.hashBeforeSend ||
            event.hashAtSocketWrite
              ? `val ${event.hashBeforeValidation ?? "—"} · send ${event.hashBeforeSend ?? "—"} · write ${event.hashAtSocketWrite ?? "—"}`
              : null
          }
        />
        <StageDetailRow
          label="Flushed"
          value={event.bodyFullyFlushed ? "yes" : "no"}
        />
        <StageDetailRow
          label="Abort"
          value={
            event.aborted
              ? event.abortReason ?? "aborted"
              : null
          }
        />
        <StageDetailRow
          label="Socket events"
          value={event.socketEvents.join(" → ") || null}
        />
      </div>
    </article>
  );
}

function TransportSection({
  events,
  onClear,
}: {
  readonly events: readonly ProviderTransportEvent[];
  readonly onClear: () => void;
}) {
  const summary = useMemo(() => summarizeTransportLog(events), [events]);
  const recent = useMemo(() => [...events].reverse().slice(0, 12), [events]);

  return (
    <section
      className="pipeline-inspector__transport"
      aria-label="Provider HTTP transport"
      data-testid="pipeline-transport"
    >
      <header className="pipeline-inspector__transport-header">
        <div>
          <h3 className="pipeline-inspector__transport-title">HTTP Transport</h3>
          <p className="pipeline-inspector__transport-hint">
            Safe metrics only — no keys, prompts, or response bodies. HTTP 400 with
            “Anthropic rejected request JSON” means their request-body parser rejected
            the POST; local write counters are shown separately.
          </p>
        </div>
        <button
          type="button"
          className="pipeline-inspector__transport-clear"
          onClick={onClear}
          disabled={events.length === 0}
        >
          Clear
        </button>
      </header>
      <div className="pipeline-inspector__metrics pipeline-inspector__metrics--compact">
        <MetricChip label="Events" value={String(summary.total)} />
        <MetricChip label="Problems" value={String(summary.problems)} />
        <MetricChip
          label="1st-attempt fails"
          value={String(summary.firstAttemptProblems)}
        />
        <MetricChip
          label="Last problem"
          value={
            summary.lastProblem
              ? `a${summary.lastProblem.attempt} · ${formatTruncationSource(summary.lastProblem.truncationSource)}`
              : "—"
          }
        />
      </div>
      {recent.length === 0 ? (
        <p className="pipeline-inspector__transport-empty">
          Provider HTTP calls will appear here as they complete.
        </p>
      ) : (
        <div className="pipeline-inspector__transport-list">
          {recent.map((event) => (
            <TransportRow
              key={`${event.requestId}:${event.attempt}`}
              event={event}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StageCard({
  stage,
  expanded,
  developerMode,
  onToggle,
}: {
  readonly stage: PipelineStageDiagnostics;
  readonly expanded: boolean;
  readonly developerMode: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <section
      className={`pipeline-inspector__stage pipeline-inspector__stage--${stage.status}${expanded ? " pipeline-inspector__stage--expanded" : ""}`}
    >
      <button
        type="button"
        className="pipeline-inspector__stage-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={`pipeline-inspector__status ${statusClass(stage.status)}`}>
          {pipelineStatusGlyph(stage.status)}
        </span>
        <span className="pipeline-inspector__stage-title">{stage.label}</span>
        <span className="pipeline-inspector__stage-meta">
          {formatDuration(stage.durationMs)}
          {stage.provider ? ` · ${stage.provider}` : ""}
        </span>
        {stage.error ? (
          <span className="pipeline-inspector__stage-error">{stage.error}</span>
        ) : null}
      </button>
      {expanded ? (
        <div className="pipeline-inspector__stage-body">
          <div className="pipeline-inspector__detail-grid">
            <StageDetailRow label="Status" value={stage.status} />
            <StageDetailRow label="Duration" value={formatDuration(stage.durationMs)} />
            <StageDetailRow label="Provider" value={stage.provider} />
            <StageDetailRow label="Model" value={stage.model} />
            <StageDetailRow
              label="Tokens"
              value={
                stage.promptTokens != null || stage.completionTokens != null
                  ? `${stage.promptTokens ?? "—"} prompt / ${stage.completionTokens ?? "—"} completion`
                  : null
              }
            />
            <StageDetailRow label="Request size" value={formatBytes(stage.requestBytes)} />
            <StageDetailRow label="Response size" value={formatBytes(stage.responseBytes)} />
            <StageDetailRow
              label="Files affected"
              value={stage.filesAffected.length ? stage.filesAffected.join(", ") : null}
            />
            <StageDetailRow
              label="Retry count"
              value={stage.retryCount > 0 ? String(stage.retryCount) : null}
            />
            <StageDetailRow label="Timestamp" value={stage.timestamp} />
            {developerMode ? (
              <StageDetailRow
                label="HTTP status"
                value={stage.httpStatus != null ? String(stage.httpStatus) : null}
              />
            ) : null}
          </div>
          {stage.error ? (
            <div className="pipeline-inspector__error-box" role="alert">
              <strong>Error</strong>
              <p>{stage.error}</p>
            </div>
          ) : null}
          {stage.acceptedFiles.length > 0 ? (
            <div className="pipeline-inspector__file-list">
              <h4>Accepted files</h4>
              <ul>
                {stage.acceptedFiles.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {stage.rejectedFiles.length > 0 ? (
            <div className="pipeline-inspector__file-list pipeline-inspector__file-list--rejected">
              <h4>Rejected files</h4>
              <ul>
                {stage.rejectedFiles.map((file) => (
                  <li key={`${file.path}:${file.reason}`}>
                    <span>{file.path}</span>
                    <span className="pipeline-inspector__reject-reason">{file.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {developerMode && stage.rawPrompt ? (
            <details className="pipeline-inspector__dev-block">
              <summary>Raw prompt</summary>
              <pre>{stage.rawPrompt}</pre>
            </details>
          ) : null}
          {developerMode && stage.rawProviderResponse ? (
            <details className="pipeline-inspector__dev-block">
              <summary>Raw provider response</summary>
              <pre>{stage.rawProviderResponse}</pre>
            </details>
          ) : null}
          {developerMode && stage.parserOutput ? (
            <details className="pipeline-inspector__dev-block">
              <summary>Parser output</summary>
              <pre>{stage.parserOutput}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function PipelineInspectorPanel({
  greenfieldRun,
  planApplySession,
}: PipelineInspectorPanelProps) {
  const api = typeof window !== "undefined" ? window.bryantlabs : undefined;
  const { project } = useWorkspace();
  const [developerMode, setDeveloperMode] = useDeveloperDiagnosticsEnabled();
  const [expandedStage, setExpandedStage] = useState<PipelineStageId | null>(null);
  const { events: transportEvents, clear: clearTransport } = useProviderTransportLog(api);

  const editPhasePlan = useMemo(
    () => readEditPhasePlanForProject(project?.path),
    [project?.path, greenfieldRun.entries.length, greenfieldRun.latestAction],
  );

  const model = useMemo(
    () =>
      buildPipelineInspectorViewModel({
        greenfieldRun,
        ...(planApplySession != null ? { planApplySession } : {}),
      }),
    [greenfieldRun, planApplySession],
  );

  const toggleDeveloperMode = useCallback(() => {
    setDeveloperMode(!developerMode);
  }, [developerMode, setDeveloperMode]);

  const toggleStage = useCallback((id: PipelineStageId) => {
    setExpandedStage((prev) => (prev === id ? null : id));
  }, []);

  if (!model.hasRun && transportEvents.length === 0) {
    return (
      <div className="pipeline-inspector pipeline-inspector--empty">
        <EmptyState
          title="No pipeline run yet"
          description="Start a build or Apply Plan run to inspect pipeline stages here."
        />
      </div>
    );
  }

  return (
    <div className="pipeline-inspector" data-testid="pipeline-inspector">
      <header className="pipeline-inspector__header">
        <h2 className="pipeline-inspector__title">Pipeline Diagnostics</h2>
        <label className="pipeline-inspector__dev-toggle">
          <input
            type="checkbox"
            checked={developerMode}
            onChange={toggleDeveloperMode}
          />
          Developer diagnostics
        </label>
      </header>

      <TransportSection events={transportEvents} onClear={clearTransport} />

      {editPhasePlan && editPhasePlan.phases.length > 0 ? (
        <section
          className="pipeline-inspector__edit-phases"
          aria-label="Edit phase plan"
          data-testid="edit-phase-plan"
        >
          <h3 className="pipeline-inspector__section-title">
            Edit phases · {editPhasePlan.status} · {editPhasePlan.phases.length} total
          </h3>
          <ol className="pipeline-inspector__edit-phase-list">
            {editPhasePlan.phases.map((phase) => {
              const state = editPhasePlan.phaseStates[phase.id];
              const elapsed =
                state?.elapsedMs != null
                  ? `${Math.round(state.elapsedMs / 1000)}s`
                  : state?.startedAt
                    ? `${Math.round((Date.now() - state.startedAt) / 1000)}s`
                    : "—";
              return (
                <li key={phase.id} data-status={state?.status ?? "pending"}>
                  <strong>{phase.title}</strong>
                  <span>
                    {state?.status ?? "pending"} · attempt {state?.attempt ?? 0} ·{" "}
                    {elapsed}
                  </span>
                  <span>{phase.files.map((f) => f.relPath).join(", ")}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {model.hasRun ? (
        <>
          <section className="pipeline-inspector__metrics" aria-label="Run metrics">
            <MetricChip label="Total time" value={formatDuration(model.metrics.totalDurationMs)} />
            <MetricChip label="AI calls" value={String(model.metrics.totalAiCalls)} />
            <MetricChip
              label="Prompt tokens"
              value={model.metrics.promptTokens != null ? String(model.metrics.promptTokens) : "—"}
            />
            <MetricChip
              label="Completion tokens"
              value={
                model.metrics.completionTokens != null ? String(model.metrics.completionTokens) : "—"
              }
            />
            <MetricChip label="Request size" value={formatBytes(model.metrics.requestBytes)} />
            <MetricChip label="Response size" value={formatBytes(model.metrics.responseBytes)} />
            <MetricChip label="Files explored" value={String(model.metrics.filesExplored)} />
            <MetricChip label="Files modified" value={String(model.metrics.filesModified)} />
            <MetricChip label="Files written" value={String(model.metrics.filesWritten)} />
          </section>

          <nav className="pipeline-inspector__flow" aria-label="Pipeline flow">
            {model.stages.map((stage, index) => (
              <button
                key={stage.id}
                type="button"
                className={`pipeline-inspector__flow-step pipeline-inspector__flow-step--${stage.status}${expandedStage === stage.id ? " pipeline-inspector__flow-step--active" : ""}`}
                onClick={() => toggleStage(stage.id)}
                title={stage.error ?? stage.label}
              >
                <span className={`pipeline-inspector__flow-glyph ${statusClass(stage.status)}`}>
                  {pipelineStatusGlyph(stage.status)}
                </span>
                <span className="pipeline-inspector__flow-label">{stage.shortLabel}</span>
                {index < model.stages.length - 1 ? (
                  <span className="pipeline-inspector__flow-connector" aria-hidden />
                ) : null}
              </button>
            ))}
          </nav>

          <div className="pipeline-inspector__stages">
            {model.stages.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                expanded={expandedStage === stage.id}
                developerMode={developerMode}
                onToggle={() => toggleStage(stage.id)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
