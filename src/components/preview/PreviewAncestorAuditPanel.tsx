import type { PreviewAncestorAudit } from "@/core/preview/previewAncestorAudit";

export function PreviewAncestorAuditPanel({
  audit,
}: {
  readonly audit: PreviewAncestorAudit | null;
}) {
  if (!audit || audit.rows.length === 0) return null;

  return (
    <details className="preview-panel__diagnostics preview-panel__diagnostics--ancestor">
      <summary>Preview height chain</summary>
      <p className="preview-panel__hint">
        <strong>Collapse:</strong> {audit.collapseReason}
      </p>
      {audit.collapseAt ? (
        <dl className="preview-panel__diagnostics-grid">
          <div className="preview-panel__diagnostics-row">
            <dt>Limiting node</dt>
            <dd className="preview-panel__mono">{audit.collapseAt.selector}</dd>
          </div>
          <div className="preview-panel__diagnostics-row">
            <dt>Parent</dt>
            <dd className="preview-panel__mono">
              {audit.collapseParent?.selector ?? "—"}
            </dd>
          </div>
        </dl>
      ) : null}
      <div className="preview-ancestor-audit__table-wrap">
        <table className="preview-ancestor-audit__table">
          <thead>
            <tr>
              <th>Element</th>
              <th>clientH</th>
              <th>scrollH</th>
              <th>offsetH</th>
              <th>height</th>
              <th>min/max</th>
              <th>overflow</th>
              <th>display</th>
              <th>flex</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr
                key={`${row.depth}-${row.selector}`}
                className={
                  audit.collapseAt?.selector === row.selector
                    ? "preview-ancestor-audit__row--limit"
                    : undefined
                }
              >
                <td className="preview-panel__mono">{row.selector}</td>
                <td>{row.clientHeight}</td>
                <td>{row.scrollHeight}</td>
                <td>{row.offsetHeight}</td>
                <td>{row.computedHeight}</td>
                <td>
                  {row.computedMinHeight} / {row.computedMaxHeight}
                </td>
                <td>{row.overflow}</td>
                <td>{row.display}</td>
                <td>{row.flex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
