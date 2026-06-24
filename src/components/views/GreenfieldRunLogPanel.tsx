import { useEffect, useRef, useState } from "react";
import {
  RUN_LOG_STAGE_LABELS,
  formatFullGreenfieldDebugReport,
  formatLiveRunLog,
  formatSummaryRunLog,
  type GreenfieldRunLogEntry,
  type GreenfieldRunSummary,
} from "@/core/greenfield/runLog";
import type { GreenfieldDebugReport } from "@/core/greenfield/debug";

interface GreenfieldRunLogPanelProps {
  entries: readonly GreenfieldRunLogEntry[];
  summary: GreenfieldRunSummary;
  debugReport?: GreenfieldDebugReport | null;
  /** Dock layout: tighter padding, hide duplicate title. */
  compact?: boolean;
}

export function GreenfieldRunLogPanel({
  entries,
  summary,
  debugReport,
  compact = false,
}: GreenfieldRunLogPanelProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const liveEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    liveEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries.length]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(`${label} copied`);
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  if (entries.length === 0) return null;

  return (
    <section className={`gf-runlog${compact ? " gf-runlog--compact" : ""}`}>
      {!compact ? <h3 className="gf-runlog__title">Run log</h3> : null}

      <div className="gf-runlog__actions">
        <button
          type="button"
          className="prov-btn"
          onClick={() => void copyText("Live log", formatLiveRunLog(entries))}
        >
          Copy live log
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() => void copyText("Summary", formatSummaryRunLog(summary))}
        >
          Copy summary log
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() =>
            void copyText(
              "Full report",
              formatFullGreenfieldDebugReport({
                entries,
                summary,
                ...(debugReport !== undefined && debugReport !== null
                  ? { debugReport }
                  : {}),
              }),
            )
          }
        >
          Copy full debug report
        </button>
        {copyNote ? <span className="gf-runlog__copynote">{copyNote}</span> : null}
      </div>

      <details className="gf-runlog__live" open>
        <summary className="gf-runlog__summary">Live run log ({entries.length})</summary>
        <ol className="gf-runlog__list">
          {entries.map((e) => (
            <li
              key={e.id}
              className={`gf-runlog__item gf-runlog__item--${e.status}`}
            >
              <span className="gf-runlog__time">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span className="gf-runlog__stage">{RUN_LOG_STAGE_LABELS[e.stage]}</span>
              <span className={`gf-runlog__status gf-runlog__status--${e.status}`}>
                {e.status}
              </span>
              <span className="gf-runlog__msg">{e.message}</span>
              {e.details ? (
                <pre className="gf-runlog__details">{e.details}</pre>
              ) : null}
            </li>
          ))}
        </ol>
        <div ref={liveEndRef} />
      </details>

      <details className="gf-runlog__summarybox" open={summary.runResult !== "idle"}>
        <summary className="gf-runlog__summary">
          Summary — {summary.runResult}
        </summary>
        <dl className="gf-runlog__meta">
          <Meta label="Run result" value={summary.runResult} />
          {summary.latestAction ? (
            <Meta label="Latest action" value={summary.latestAction.summary} />
          ) : null}
          <Meta label="Target folder" value={summary.targetFolder ?? "—"} mono />
          <Meta label="Provider" value={summary.provider ?? "—"} />
          <Meta label="Model" value={summary.model ?? "—"} />
          <Meta
            label="Duration"
            value={
              summary.totalDurationMs !== null
                ? `${summary.totalDurationMs} ms`
                : "—"
            }
          />
          <Meta
            label="Files generated"
            value={
              summary.filesGenerated.length
                ? summary.filesGenerated.join(", ")
                : "—"
            }
          />
          <Meta
            label="Files written"
            value={
              summary.filesWritten.length
                ? summary.filesWritten.join(", ")
                : "—"
            }
          />
          <Meta
            label="Commands"
            value={summary.commandsRun.length ? summary.commandsRun.join("; ") : "—"}
          />
          <Meta label="TypeScript" value={summary.typescriptResult ?? "—"} />
          <Meta label="Build" value={summary.buildResult ?? "—"} />
          <Meta label="Preview" value={summary.previewResult ?? "—"} />
          <Meta
            label="Errors"
            value={summary.errors.length ? summary.errors.join(" | ") : "—"}
          />
        </dl>
      </details>
    </section>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="gf-runlog__row">
      <dt>{label}</dt>
      <dd className={mono ? "gf-runlog__mono" : undefined}>{value}</dd>
    </div>
  );
}
