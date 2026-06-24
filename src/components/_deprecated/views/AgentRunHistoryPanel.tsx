import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";
import { agentRunStepIcon } from "@/core/agent/agentRunCard";

interface AgentRunHistoryPanelProps {
  readonly history: readonly AgentRunArtifact[];
  readonly selectedRunId: string | null;
  readonly activeRunId: string | null;
  readonly onSelect: (runId: string | null) => void;
}

function outcomeLabel(outcome: AgentRunArtifact["outcome"]): string {
  if (outcome === "success") return "Success";
  if (outcome === "cancelled") return "Cancelled";
  return "Failed";
}

export function AgentRunHistoryPanel({
  history,
  selectedRunId,
  activeRunId,
  onSelect,
}: AgentRunHistoryPanelProps) {
  if (history.length === 0 && !activeRunId) {
    return (
      <section className="agent-run-history agent-run-history--empty" aria-label="Run history">
        <p className="agent-run-history__empty">Run history appears after your first agent run.</p>
      </section>
    );
  }

  const reversed = [...history].reverse();

  return (
    <section className="agent-run-history" aria-label="Run history">
      <div className="agent-run-history__head">
        <h4 className="agent-run-history__title">Run history</h4>
        {selectedRunId ? (
          <button type="button" className="build-view__link" onClick={() => onSelect(null)}>
            Live
          </button>
        ) : null}
      </div>
      <ol className="agent-run-history__list">
        {activeRunId ? (
          <li className="agent-run-history__item agent-run-history__item--active">
            <span className="agent-run-history__status agent-run-history__status--running">
              {agentRunStepIcon("running")}
            </span>
            <div className="agent-run-history__body">
              <span className="agent-run-history__prompt">Current run</span>
              <span className="agent-run-history__meta">Running…</span>
            </div>
          </li>
        ) : null}
        {reversed.map((run) => {
          const selected = selectedRunId === run.runId;
          return (
            <li key={run.runId}>
              <button
                type="button"
                className={`agent-run-history__item${selected ? " agent-run-history__item--selected" : ""}`}
                onClick={() => onSelect(selected ? null : run.runId)}
                aria-pressed={selected}
              >
                <span
                  className={`agent-run-history__status agent-run-history__status--${run.outcome}`}
                >
                  {agentRunStepIcon(run.outcome === "success" ? "success" : "failed")}
                </span>
                <div className="agent-run-history__body">
                  <span className="agent-run-history__prompt">
                    Run #{run.runNumber} · {run.prompt.slice(0, 64)}
                    {run.prompt.length > 64 ? "…" : ""}
                  </span>
                  <span className="agent-run-history__meta">
                    {outcomeLabel(run.outcome)} · {formatGreenfieldElapsed(run.durationMs)}
                    {run.provider ? ` · ${run.provider}` : ""}
                    {run.filesModified.length > 0
                      ? ` · ${run.filesModified.length} file${run.filesModified.length === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
