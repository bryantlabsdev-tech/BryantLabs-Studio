import { useState } from "react";
import type { GreenfieldRepairSnapshot } from "@/core/greenfield/repair";

export function GreenfieldRepairPanel({
  repair,
  repairing,
  onRepair,
  onOpenFile,
  onAbandon,
  successMessage,
  headline,
}: {
  repair: GreenfieldRepairSnapshot;
  repairing: boolean;
  onRepair: () => void;
  onOpenFile: () => void;
  onAbandon: () => void;
  successMessage?: string | null;
  headline?: string;
}) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(repair.repairPrompt);
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  if (successMessage) {
    return <p className="aipatch__success">{successMessage}</p>;
  }

  return (
    <div className="auto-fix" role="region" aria-label="Greenfield repair">
      <h4 className="plan-apply__diff-title">
        {headline ?? "Generated app needs repair"}
      </h4>
      <p className="aipatch__error">
        Error:
        <br />
        {repair.primaryErrorLine}
      </p>

      {repair.attempts.length > 0 ? (
        <ol className="auto-fix__timeline">
          {repair.attempts.map((a) => (
            <li
              key={a.attempt}
              className={`auto-fix__attempt auto-fix__attempt--${a.outcome}`}
            >
              <strong>Attempt {a.attempt}</strong> — {a.targetPath}
              <span className="plan__muted"> {a.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {repair.status === "failed" ? (
        <p className="aipatch__error">
          Repair attempts exhausted. Fix manually or copy the repair prompt.
        </p>
      ) : null}

      <div className="plan-apply__actions">
        {repair.status === "repair_needed" || repair.status === "failed" ? (
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            disabled={repairing}
            onClick={onRepair}
          >
            {repairing ? "Repairing…" : "Repair generated app"}
          </button>
        ) : null}
        <button type="button" className="prov-btn" onClick={() => void copyPrompt()}>
          Copy repair prompt
        </button>
        {copyNote ? <span className="plan__muted"> {copyNote}</span> : null}
        <button type="button" className="prov-btn" onClick={onOpenFile}>
          Open file
        </button>
        <button type="button" className="prov-btn" onClick={onAbandon}>
          Abandon
        </button>
      </div>
    </div>
  );
}
