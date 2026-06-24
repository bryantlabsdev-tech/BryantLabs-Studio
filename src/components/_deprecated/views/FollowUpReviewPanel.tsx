import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { DiffRowsView } from "@/components/editor/DiffRowsView";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

interface FollowUpReviewPanelProps {
  onApply: () => void;
  onRevision: () => void;
  onCancel: () => void;
  /** Compact bar for sticky composer (no inline diff). */
  compact?: boolean;
}

export function FollowUpReviewPanel({
  onApply,
  onRevision,
  onCancel,
  compact = false,
}: FollowUpReviewPanelProps) {
  const { planApplySession, setCenterTab } = useWorkspace();
  const session = planApplySession;

  const changedFiles = useMemo(
    () =>
      session?.files.filter(
        (f) => f.status === "ready" && f.diffStats?.changed,
      ) ?? [],
    [session?.files],
  );

  const [previewPath, setPreviewPath] = useState<string | null>(
    changedFiles[0]?.relPath ?? null,
  );

  const previewFile: PlanApplyFileEntry | null =
    changedFiles.find((f) => f.relPath === previewPath) ??
    changedFiles[0] ??
    null;

  if (
    !session ||
    (session.phase !== "review" && session.phase !== "waiting_for_review")
  ) {
    return null;
  }

  const summary =
    session.planSummary.trim() ||
    "Proposed updates based on your request.";
  const readyHeading =
    session.phase === "waiting_for_review"
      ? "Changes ready for review"
      : "Review changes";

  return (
    <section className={`follow-up-review${compact ? " follow-up-review--compact" : ""}`}>
      <h4 className="build-view__heading">{readyHeading}</h4>
      <p className="follow-up-review__summary">{summary}</p>

      {compact ? (
        <p className="follow-up-review__compact-meta plan__muted">
          {session.phase === "waiting_for_review"
            ? "Changes ready for review"
            : `${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} ready to apply`}
        </p>
      ) : (
        <>
      <div className="follow-up-review__files">
        <span className="follow-up-review__files-label">
          {changedFiles.length} file{changedFiles.length === 1 ? "" : "s"} changed
        </span>
        <ul className="follow-up-review__file-list">
          {changedFiles.map((f) => (
            <li key={f.relPath}>
              <button
                type="button"
                className={`follow-up-review__file${
                  previewFile?.relPath === f.relPath
                    ? " follow-up-review__file--active"
                    : ""
                }`}
                onClick={() => setPreviewPath(f.relPath)}
              >
                <span className="follow-up-review__path">{f.relPath}</span>
                {f.diffStats ? (
                  <span className="follow-up-review__stats">
                    +{f.diffStats.added} / −{f.diffStats.removed}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {previewFile?.proposal && previewFile.basisContent !== undefined ? (
        <div className="follow-up-review__diff">
          <DiffRowsView
            before={previewFile.basisContent}
            after={previewFile.proposal.newContent}
            description={previewFile.proposal.summary}
          />
        </div>
      ) : null}
        </>
      )}

      <div className="build-view__actions">
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          onClick={onApply}
        >
          Apply Changes
        </button>
        <button type="button" className="prov-btn" onClick={onRevision}>
          Ask for Revision
        </button>
        <button type="button" className="prov-btn" onClick={onCancel}>
          Cancel
        </button>
        {!compact ? (
          <button
            type="button"
            className="build-view__link"
            onClick={() => setCenterTab("diff")}
          >
            Full diff
          </button>
        ) : null}
      </div>
    </section>
  );
}
