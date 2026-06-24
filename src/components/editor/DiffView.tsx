import { useMemo } from "react";
import { computeDiff, type Patch } from "@/core/editor";

interface DiffViewProps {
  patch: Patch;
}

/**
 * Before/after diff for a proposed patch. Read-only preview — rendering the
 * diff never writes anything.
 */
export function DiffView({ patch }: DiffViewProps) {
  const rows = useMemo(
    () => computeDiff(patch.before, patch.after),
    [patch],
  );

  return (
    <div className="diff">
      <p className="diff__desc">{patch.description}</p>
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
    </div>
  );
}
