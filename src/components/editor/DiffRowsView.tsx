import { useMemo } from "react";
import { computeDiff } from "@/core/editor";

interface DiffRowsViewProps {
  readonly before: string;
  readonly after: string;
  readonly description?: string;
}

/** Read-only line diff between two file snapshots. */
export function DiffRowsView({ before, after, description }: DiffRowsViewProps) {
  const rows = useMemo(() => computeDiff(before, after), [before, after]);
  const unchanged = before === after;

  return (
    <div className="diff">
      {description ? <p className="diff__desc">{description}</p> : null}
      {unchanged ? (
        <p className="plan__muted">No changes in this proposal.</p>
      ) : (
        <div className="diff__rows">
          {rows.map((row, i) => (
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
      )}
    </div>
  );
}
