import type { PersistedRunCheckpoint } from "@/core/runPersistence";

function formatSavedAt(savedAt: number): string {
  const delta = Date.now() - savedAt;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) {
    const mins = Math.round(delta / 60_000);
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (delta < 86_400_000) {
    const hrs = Math.round(delta / 3_600_000);
    return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }
  return new Date(savedAt).toLocaleString();
}

export function ResumeRunDialog({
  checkpoint,
  onResume,
  onAbandon,
}: {
  checkpoint: PersistedRunCheckpoint;
  onResume: () => void;
  onAbandon: () => void;
}) {
  return (
    <div className="resume-run" role="dialog" aria-modal="true">
      <div className="resume-run__card">
        <h3 className="resume-run__title">Resume interrupted run?</h3>
        <p className="resume-run__lead">{checkpoint.label}</p>
        <p className="resume-run__meta">
          <span>{checkpoint.statusNote}</span>
          <span className="resume-run__sep">·</span>
          <span>Saved {formatSavedAt(checkpoint.savedAt)}</span>
        </p>
        {checkpoint.interruptedWhileRunning ? (
          <p className="resume-run__note">
            This run was interrupted while active and was saved as paused.
          </p>
        ) : null}
        <div className="resume-run__actions">
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={onResume}
          >
            Resume
          </button>
          <button type="button" className="prov-btn" onClick={onAbandon}>
            Abandon
          </button>
        </div>
      </div>
    </div>
  );
}
