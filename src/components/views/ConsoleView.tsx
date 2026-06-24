import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { formatConsoleTime } from "@/core/console/runLogBridge";
import {
  CONSOLE_CATEGORY_LABELS,
  type ConsoleLogCategory,
  type ConsoleLogEntry,
  type ExecutionGraphNode,
} from "@/core/console/types";

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function LogLine({ entry }: { entry: ConsoleLogEntry }) {
  const fieldLines = Object.entries(entry.fields).map(
    ([k, v]) => `${k}=${v}`,
  );

  return (
    <div
      className={`dev-console__entry dev-console__entry--${entry.status} dev-console__entry--${entry.category}`}
    >
      <div className="dev-console__entry-head">
        <span className="dev-console__entry-time">[{formatConsoleTime(entry.timestamp)}]</span>
        <span className="dev-console__entry-title">{entry.title}</span>
      </div>
      {fieldLines.length > 0 ? (
        <div className="dev-console__entry-fields">
          {fieldLines.map((line) => (
            <div key={line} className="dev-console__entry-field">
              {line}
            </div>
          ))}
        </div>
      ) : null}
      {entry.filePath ? (
        <div className="dev-console__entry-loc">
          {entry.filePath}
          {entry.lineNumber != null ? `:${entry.lineNumber}` : ""}
        </div>
      ) : null}
      {entry.details && entry.status !== "failed" ? (
        <pre className="dev-console__entry-details">{entry.details}</pre>
      ) : null}
    </div>
  );
}

function ExecutionGraph({ nodes }: { nodes: readonly ExecutionGraphNode[] }) {
  return (
    <div className="dev-console__graph" aria-label="Execution graph">
      {nodes.map((node, i) => (
        <div key={node.id} className="dev-console__graph-row">
          <div
            className={`dev-console__graph-node dev-console__graph-node--${node.state}`}
            title={node.state}
          >
            <span className="dev-console__graph-dot" />
            <span className="dev-console__graph-label">{node.label}</span>
          </div>
          {i < nodes.length - 1 ? (
            <div className="dev-console__graph-arrow" aria-hidden>
              ↓
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MetadataBar() {
  const { developerConsole } = useWorkspace();
  const { metadata } = developerConsole;

  if (metadata.status === "idle" && !metadata.runId) {
    return (
      <p className="dev-console__idle plan__muted">
        No active run. Start an Agent prompt to stream execution events here.
      </p>
    );
  }

  return (
    <div className="dev-console__meta">
      <div className="dev-console__meta-item">
        <span className="dev-console__meta-label">Provider</span>
        <span className="dev-console__meta-value">{metadata.provider ?? "—"}</span>
      </div>
      <div className="dev-console__meta-item">
        <span className="dev-console__meta-label">Model</span>
        <span className="dev-console__meta-value">{metadata.model ?? "—"}</span>
      </div>
      <div className="dev-console__meta-item">
        <span className="dev-console__meta-label">Elapsed</span>
        <span className="dev-console__meta-value">{formatElapsed(metadata.elapsedMs)}</span>
      </div>
      <div className="dev-console__meta-item">
        <span className="dev-console__meta-label">Stage</span>
        <span className="dev-console__meta-value">{metadata.currentStage ?? "—"}</span>
      </div>
      <div className="dev-console__meta-item">
        <span className="dev-console__meta-label">File</span>
        <span className="dev-console__meta-value dev-console__meta-value--mono">
          {metadata.currentFile ?? "—"}
        </span>
      </div>
      <div className="dev-console__meta-item">
        <span className="dev-console__meta-label">AI calls</span>
        <span className="dev-console__meta-value">
          {metadata.aiCallsUsed}
          {metadata.estimatedAiCalls > 0 ? ` / ~${metadata.estimatedAiCalls}` : ""}
        </span>
      </div>
    </div>
  );
}

export function ConsoleView() {
  const {
    developerConsole,
    selectDeveloperConsoleRun,
    viewCurrentDeveloperConsoleRun,
  } = useWorkspace();
  const [filter, setFilter] = useState<ConsoleLogCategory>("all");
  const [graphOpen, setGraphOpen] = useState(true);
  const streamRef = useRef<HTMLDivElement>(null);
  const { entries, graph, failureDiagnostic, runHistory, activeRunId, selectedRunId } =
    developerConsole;

  const filteredEntries = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.category === filter);
  }, [entries, filter]);

  const runOptions = useMemo(() => {
    const current = activeRunId ? runHistory.find((r) => r.id === activeRunId) : null;
    const others = runHistory.filter((r) => r.id !== activeRunId);
    const failed = others.filter((r) => r.status === "failed");
    const previous = others.filter((r) => r.status !== "failed");
    return { current, failed, previous };
  }, [runHistory, activeRunId]);

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filteredEntries.length, selectedRunId]);

  const viewingHistorical =
    selectedRunId != null && activeRunId != null && selectedRunId !== activeRunId;

  return (
    <div className="dev-console">
      <MetadataBar />

      <div className="dev-console__toolbar">
        <div className="dev-console__filters" role="group" aria-label="Log filters">
          {(Object.keys(CONSOLE_CATEGORY_LABELS) as ConsoleLogCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`dev-console__filter${filter === cat ? " dev-console__filter--on" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {CONSOLE_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="dev-console__run-select">
          <label className="dev-console__run-label" htmlFor="dev-console-run">
            Run
          </label>
          <select
            id="dev-console-run"
            className="dev-console__run-dropdown"
            value={selectedRunId ?? activeRunId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              if (id === activeRunId) viewCurrentDeveloperConsoleRun();
              else selectDeveloperConsoleRun(id);
            }}
          >
            {runOptions.current ? (
              <option value={runOptions.current.id}>
                Current run ({runOptions.current.status})
              </option>
            ) : null}
            {runOptions.failed.length > 0 ? (
              <optgroup label="Failed runs">
                {runOptions.failed.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.startedAt).toLocaleString()} — failed
                  </option>
                ))}
              </optgroup>
            ) : null}
            {runOptions.previous.length > 0 ? (
              <optgroup label="Previous runs">
                {runOptions.previous.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.startedAt).toLocaleString()} — {r.status}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {viewingHistorical ? (
            <button
              type="button"
              className="dev-console__back-live"
              onClick={() => viewCurrentDeveloperConsoleRun()}
            >
              Back to live
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="dev-console__graph-toggle"
          aria-expanded={graphOpen}
          onClick={() => setGraphOpen((o) => !o)}
        >
          {graphOpen ? "Hide graph" : "Show graph"}
        </button>
      </div>

      <div className="dev-console__body">
        {graphOpen ? (
          <aside className="dev-console__graph-panel">
            <ExecutionGraph nodes={graph} />
          </aside>
        ) : null}

        <div className="dev-console__stream-wrap">
          <div ref={streamRef} className="dev-console__stream">
            {filteredEntries.length === 0 ? (
              <p className="plan__muted dev-console__empty">
                {filter === "all"
                  ? "Waiting for execution events…"
                  : `No ${CONSOLE_CATEGORY_LABELS[filter]} events yet.`}
              </p>
            ) : (
              filteredEntries.map((entry) => <LogLine key={entry.id} entry={entry} />)
            )}
          </div>

          {failureDiagnostic ? (
            <section className="dev-console__diag" aria-label="Error diagnostics">
              <h4 className="dev-console__diag-title">Error diagnostics</h4>
              <div className="dev-console__diag-root">
                <p className="dev-console__diag-cause">{failureDiagnostic.rootCause}</p>
                {failureDiagnostic.errorCode && failureDiagnostic.filePath ? (
                  <p className="dev-console__diag-loc">
                    <code>{failureDiagnostic.errorCode}</code>
                    {" "}
                    <code>
                      {failureDiagnostic.filePath}
                      {failureDiagnostic.lineNumber != null
                        ? `:${failureDiagnostic.lineNumber}`
                        : ""}
                    </code>
                  </p>
                ) : null}
              </div>
              <pre className="dev-console__diag-raw">{failureDiagnostic.rawError}</pre>
              {failureDiagnostic.retryActions.length > 0 ? (
                <div className="dev-console__diag-actions">
                  <span className="dev-console__diag-actions-label">Retry actions</span>
                  <ul>
                    {failureDiagnostic.retryActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
