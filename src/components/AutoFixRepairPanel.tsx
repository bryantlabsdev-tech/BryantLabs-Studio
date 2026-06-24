import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { DiffRowsView } from "@/components/editor/DiffRowsView";
import { formatAutoFixSummaryCopy } from "@/core/autoFix/summary";

export function AutoFixRepairPanel() {
  const { autoFixSession, approveAutoFixRepair, cancelAutoFix } = useWorkspace();
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const session = autoFixSession;
  const summaryCopy = useMemo(
    () => (session ? formatAutoFixSummaryCopy(session) : ""),
    [session],
  );

  if (!session) return null;

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryCopy);
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <div className="auto-fix" role="region" aria-label="Autonomous fix loop">
      <h4 className="plan-apply__diff-title">Autonomous Fix Loop</h4>
      <p className="plan__muted">{session.originalFailureLine}</p>

      <ol className="auto-fix__timeline">
        {session.attempts.map((a) => (
          <li
            key={a.attempt}
            className={`auto-fix__attempt auto-fix__attempt--${a.outcome}`}
          >
            <strong>Attempt {a.attempt}</strong> — {a.headline}
            <span className="plan__muted"> {a.detail}</span>
          </li>
        ))}
      </ol>

      {session.pendingRepair && session.phase === "awaiting_approval" ? (
        <section className="auto-fix__proposal">
          <h5 className="auto-fix__subhead">Proposed repair — {session.pendingRepair.relPath}</h5>
          <p className="plan__muted">{session.pendingRepair.summary}</p>
          <DiffRowsView
            before={session.pendingRepair.basisContent}
            after={session.pendingRepair.newContent}
            description="Repair diff"
          />
          <div className="plan-apply__actions">
            <button
              type="button"
              className="prov-btn prov-btn--primary"
              onClick={() => void approveAutoFixRepair()}
            >
              Apply repair &amp; verify
            </button>
            <button type="button" className="prov-btn" onClick={() => cancelAutoFix()}>
              Cancel auto fix
            </button>
          </div>
        </section>
      ) : null}

      {session.phase === "success" ? (
        <p className="plan-apply__ok">Auto Fix restored a passing build.</p>
      ) : null}

      {session.phase === "failed" || session.phase === "proposing" ? (
        <p className="aipatch__error">{session.error ?? "Repair in progress or failed."}</p>
      ) : null}

      {session.filesChanged.length > 0 ? (
        <p className="plan__muted">
          Repair files changed: {session.filesChanged.join(", ")}
        </p>
      ) : null}

      <div className="plan-apply__actions">
        <button type="button" className="prov-btn" onClick={() => void copySummary()}>
          Copy repair summary
        </button>
        {copyNote ? <span className="plan__muted"> {copyNote}</span> : null}
        {session.phase !== "awaiting_approval" ? (
          <button type="button" className="prov-btn" onClick={() => cancelAutoFix()}>
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
