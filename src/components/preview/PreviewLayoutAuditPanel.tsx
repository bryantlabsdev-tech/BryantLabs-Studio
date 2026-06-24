import type { PreviewLayoutAudit } from "@/core/preview/previewLayoutAudit";

export function PreviewLayoutAuditPanel({
  audit,
}: {
  readonly audit: PreviewLayoutAudit | null;
}) {
  if (!audit) return null;

  return (
    <details className="preview-layout-audit">
      <summary>Preview layout audit</summary>
      <dl className="preview-panel__diagnostics-grid">
        <div className="preview-panel__diagnostics-row">
          <dt>preview root height</dt>
          <dd>{audit.previewRootHeight}px</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>toolbar height</dt>
          <dd>{audit.toolbarHeight}px</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>center panel height</dt>
          <dd>{audit.centerPanelHeight}px</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>available preview height</dt>
          <dd>{audit.availablePreviewHeight}px</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>frame wrapper height</dt>
          <dd>{audit.frameWrapperHeight}px</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>iframe/webview height</dt>
          <dd>{audit.frameHeight}px</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>scroll container height</dt>
          <dd>{audit.scrollContainerHeight}px</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>device mode</dt>
          <dd>{audit.deviceMode}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>zoom mode</dt>
          <dd>{audit.zoomMode}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>viewport controls</dt>
          <dd>{audit.viewportControlsEnabled ? "enabled" : "disabled"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>limiting element</dt>
          <dd className="preview-panel__mono">{audit.limitingElement}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>limiting reason</dt>
          <dd>{audit.limitingReason}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>limiting computed CSS</dt>
          <dd className="preview-panel__mono">{audit.limitingComputedCss}</dd>
        </div>
      </dl>
      <details className="preview-layout-audit__chain">
        <summary>Ancestor chain</summary>
        <table className="preview-layout-audit__table">
          <thead>
            <tr>
              <th>Element</th>
              <th>clientH</th>
              <th>height</th>
              <th>flex</th>
              <th>overflow</th>
            </tr>
          </thead>
          <tbody>
            {audit.chain.map((row) => (
              <tr key={row.selector}>
                <td className="preview-panel__mono">{row.selector}</td>
                <td>{row.clientHeight}</td>
                <td>{row.height}</td>
                <td>{row.flex}</td>
                <td>{row.overflow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </details>
  );
}
