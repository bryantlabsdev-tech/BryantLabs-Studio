import { useState } from "react";
import type { DiagnosticReportBundle } from "@/core/diagnostics/diagnosticReport";
import {
  copyDiagnosticReportText,
  exportDiagnosticReportJson,
  exportDiagnosticReportTxt,
} from "@/core/diagnostics/diagnosticReport";

interface DiagnosticReportModalProps {
  readonly bundle: DiagnosticReportBundle;
  readonly onClose: () => void;
}

export function DiagnosticReportModal({ bundle, onClose }: DiagnosticReportModalProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const handleCopy = async () => {
    const ok = await copyDiagnosticReportText(bundle.text);
    setCopyNote(ok ? "Copied" : "Copy failed");
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <div
      className="diagnostic-modal__backdrop"
      role="presentation"
      data-testid="diagnostic-report-modal"
      onClick={onClose}
    >
      <div
        className="diagnostic-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostic-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="diagnostic-modal__head">
          <h3 id="diagnostic-modal-title">Diagnostic Report</h3>
          <button type="button" className="diagnostic-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="diagnostic-modal__actions">
          <button type="button" className="prov-btn" onClick={() => void handleCopy()}>
            Copy report
          </button>
          <button
            type="button"
            className="prov-btn"
            onClick={() => exportDiagnosticReportTxt(bundle)}
          >
            Save .txt
          </button>
          <button
            type="button"
            className="prov-btn"
            onClick={() => exportDiagnosticReportJson(bundle)}
          >
            Save .json
          </button>
          {copyNote ? <span className="diagnostic-modal__copynote">{copyNote}</span> : null}
        </div>

        <pre className="diagnostic-modal__body">{bundle.text}</pre>
      </div>
    </div>
  );
}
