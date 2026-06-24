import type { FollowUpSnapshot } from "@/core/build/followUpSnapshots";

interface SnapshotHistoryPanelProps {
  snapshots: readonly FollowUpSnapshot[];
  open: boolean;
  onToggle: () => void;
  pendingRestoreId: string | null;
  onRequestRestore: (snapshot: FollowUpSnapshot) => void;
  onConfirmRestore: (snapshot: FollowUpSnapshot) => void;
  onCancelRestore: () => void;
}

export function SnapshotHistoryPanel({
  snapshots,
  open,
  onToggle,
  pendingRestoreId,
  onRequestRestore,
  onConfirmRestore,
  onCancelRestore,
}: SnapshotHistoryPanelProps) {
  if (snapshots.length === 0) return null;

  return (
    <section className="snapshot-history">
      <button type="button" className="snapshot-history__toggle" onClick={onToggle}>
        {open ? "Hide" : "Show"} Snapshot History ({snapshots.length})
      </button>
      {open ? (
        <ul className="snapshot-history__list">
          {[...snapshots].reverse().map((snap) => (
            <li key={snap.id} className="snapshot-history__item">
              <div className="snapshot-history__meta">
                <strong>Snapshot #{snap.index}</strong>
                <span className="plan__muted">
                  {new Date(snap.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="snapshot-history__label">{snap.label}</p>
              {pendingRestoreId === snap.id ? (
                <div className="snapshot-history__confirm">
                  <p className="plan__muted">
                    This will overwrite current files with the snapshot from this run.
                  </p>
                  <div className="build-view__actions">
                    <button
                      type="button"
                      className="prov-btn prov-btn--small prov-btn--primary"
                      onClick={() => onConfirmRestore(snap)}
                    >
                      Confirm restore
                    </button>
                    <button
                      type="button"
                      className="prov-btn prov-btn--small"
                      onClick={onCancelRestore}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="prov-btn prov-btn--small"
                  onClick={() => onRequestRestore(snap)}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
