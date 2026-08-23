import { useCallback, useMemo, useState } from "react";
import { computeDiffHunks, mergeHunkDecisions } from "@/core/editor/diffHunks";

interface HunkDiffViewProps {
  readonly before: string;
  readonly after: string;
  readonly description?: string;
  readonly onPartialAfterChange?: (mergedAfter: string) => void;
}

/** Interactive diff with per-hunk accept / reject toggles. */
export function HunkDiffView({
  before,
  after,
  description,
  onPartialAfterChange,
}: HunkDiffViewProps) {
  const hunks = useMemo(() => computeDiffHunks(before, after), [before, after]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(hunks.map((h) => [h.id, true])),
  );

  const applyDecision = useCallback(
    (hunkId: string, accepted: boolean) => {
      setDecisions((prev) => {
        const next = { ...prev, [hunkId]: accepted };
        if (onPartialAfterChange) {
          onPartialAfterChange(mergeHunkDecisions(before, after, next));
        }
        return next;
      });
    },
    [after, before, onPartialAfterChange],
  );

  if (before === after) {
    return <p className="plan__muted">No changes in this proposal.</p>;
  }

  if (hunks.length === 0) {
    return <p className="plan__muted">No hunks to review.</p>;
  }

  return (
    <div className="diff diff--hunks" data-testid="hunk-diff-view">
      {description ? <p className="diff__desc">{description}</p> : null}
      {hunks.map((hunk) => {
        const accepted = decisions[hunk.id] !== false;
        return (
          <div
            key={hunk.id}
            className={`diff-hunk${accepted ? "" : " diff-hunk--rejected"}`}
            data-testid={`diff-hunk-${hunk.id}`}
          >
            <div className="diff-hunk__actions">
              <span className="diff-hunk__label">{hunk.id}</span>
              <button
                type="button"
                className={`prov-btn prov-btn--small${accepted ? " prov-btn--primary" : ""}`}
                onClick={() => applyDecision(hunk.id, true)}
                data-testid={`hunk-accept-${hunk.id}`}
              >
                Accept hunk
              </button>
              <button
                type="button"
                className={`prov-btn prov-btn--small${!accepted ? " prov-btn--primary" : ""}`}
                onClick={() => applyDecision(hunk.id, false)}
                data-testid={`hunk-reject-${hunk.id}`}
              >
                Reject hunk
              </button>
            </div>
            <div className="diff__rows">
              {hunk.rows.map((row, i) => (
                <div key={i} className={`diff-row diff-row--${row.type}`}>
                  <span className="diff-row__num">{row.leftNo ?? ""}</span>
                  <span className="diff-row__num">{row.rightNo ?? ""}</span>
                  <span className="diff-row__sign">
                    {row.type === "add" ? "+" : row.type === "remove" ? "−" : " "}
                  </span>
                  <span className="diff-row__text">{row.text || " "}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
