import { useEffect, useRef } from "react";
import {
  formatRunLogFailureRole,
  RUN_LOG_STAGE_LABELS,
  type GreenfieldRunLogEntry,
} from "@/core/greenfield/runLog";

interface GreenfieldLiveLogProps {
  entries: readonly GreenfieldRunLogEntry[];
  /** Pin scroll to newest entry while a run is active. */
  autoScroll?: boolean;
}

export function GreenfieldLiveLog({ entries, autoScroll = false }: GreenfieldLiveLogProps) {
  const liveEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const scrollParent = liveEndRef.current?.closest(".gf-logs-center__log-scroll");
    if (scrollParent instanceof HTMLElement) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
      return;
    }
    liveEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, autoScroll]);

  if (entries.length === 0) {
    return (
      <p className="center-panel__hint gf-logs-center__empty">
        Live steps appear here when Studio runs any workflow (New App, AI Plan, edits, verification, preview).
      </p>
    );
  }

  return (
    <ol className="gf-runlog__list gf-runlog__list--center">
      {entries.map((e) => (
        <li key={e.id} className={`gf-runlog__item gf-runlog__item--${e.status}`}>
          <span className="gf-runlog__time">
            {new Date(e.timestamp).toLocaleTimeString()}
          </span>
          <span className="gf-runlog__stage">{RUN_LOG_STAGE_LABELS[e.stage]}</span>
          <span className={`gf-runlog__status gf-runlog__status--${e.status}`}>
            {e.status}
          </span>
          {e.failureRole && e.failureRole !== "none" ? (
            <span className={`gf-runlog__role gf-runlog__role--${e.failureRole}`}>
              {formatRunLogFailureRole(e.failureRole)}
            </span>
          ) : null}
          <span className="gf-runlog__msg">{e.message}</span>
          {e.details ? <pre className="gf-runlog__details">{e.details}</pre> : null}
        </li>
      ))}
      <div ref={liveEndRef} className="gf-live-log__anchor" aria-hidden />
    </ol>
  );
}
