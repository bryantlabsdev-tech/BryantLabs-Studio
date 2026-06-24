import { useState } from "react";
import {
  formatDebugReport,
  type GreenfieldDebugReport,
} from "@/core/greenfield/debug";
import { GreenfieldMetricsPanel } from "@/components/views/GreenfieldMetricsPanel";
import type { GreenfieldMarkerAudit } from "@/core/greenfield/promptAudit";

interface GreenfieldDebugPanelProps {
  headline: string;
  report: GreenfieldDebugReport;
}

/**
 * Collapsible greenfield failure diagnostics (no secrets).
 */
export function GreenfieldDebugPanel({ headline, report }: GreenfieldDebugPanelProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copyReport = async () => {
    const text = formatDebugReport(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <div className="gf-debug">
      <p className="aipatch__error">{headline}</p>
      <details className="gf-debug__details">
        <summary className="gf-debug__summary">Debug details</summary>
        <dl className="gf-debug__list">
          <DebugRow label="Stage" value={report.stage} />
          {report.ipcChannel ? (
            <DebugRow label="IPC channel" value={report.ipcChannel} />
          ) : null}
          {report.provider ? (
            <DebugRow label="Provider" value={report.provider} />
          ) : null}
          {report.model ? <DebugRow label="Model" value={report.model} /> : null}
          {report.targetFolder ? (
            <DebugRow label="Target folder" value={report.targetFolder} />
          ) : null}
          <DebugRow label="Request started" value={report.requestStartedAt} />
          <DebugRow label="Elapsed (ms)" value={String(report.elapsedMs)} />
          {report.metrics?.providerConfiguredTimeoutMs !== undefined ? (
            <DebugRow
              label="Configured timeout"
              value={`${report.metrics.providerConfiguredTimeoutMs} ms (${Math.round(report.metrics.providerConfiguredTimeoutMs / 1000)} s)`}
            />
          ) : null}
          {report.errorName ? (
            <DebugRow label="Error name" value={report.errorName} />
          ) : null}
          <DebugRow label="Error message" value={report.errorMessage} />
          {report.abortCauseAnalysis ? (
            <DebugRow label="Abort audit" value={report.abortCauseAnalysis} />
          ) : null}
          {report.rawProviderError ? (
            <DebugRow label="Raw provider error" value={report.rawProviderError} />
          ) : null}
          {report.notes?.map((note, i) => (
            <DebugRow key={i} label="Note" value={note} />
          ))}
          {report.markerAudit ? (
            <MarkerAuditSection audit={report.markerAudit} />
          ) : null}
        </dl>
        {report.metrics ? (
          <GreenfieldMetricsPanel metrics={report.metrics} defaultOpen />
        ) : null}
        {report.errorStack ? (
          <>
            <p className="gf-debug__label">Error stack</p>
            <pre className="gf-debug__pre">{report.errorStack}</pre>
          </>
        ) : null}
        {report.rawProviderPayload !== undefined ? (
          <>
            <p className="gf-debug__label">Raw provider payload</p>
            <pre className="gf-debug__pre">
              {JSON.stringify(report.rawProviderPayload, null, 2)}
            </pre>
          </>
        ) : null}
        <div className="gf-debug__actions">
          <button type="button" className="prov-btn" onClick={() => void copyReport()}>
            Copy debug report
          </button>
          {copyNote ? <span className="gf-debug__copynote">{copyNote}</span> : null}
        </div>
      </details>
    </div>
  );
}

function MarkerAuditSection({ audit }: { audit: GreenfieldMarkerAudit }) {
  return (
    <>
      <DebugRow
        label="Requires all 7 files"
        value={audit.explicitlyRequiresAllSeven ? "yes (in prompt)" : "no"}
      />
      <DebugRow
        label="Example format in prompt"
        value={audit.hasExampleOutputFormat ? "yes (template only)" : "no"}
      />
      <DebugRow
        label="Detected @@FILE starts"
        value={audit.detectedFileStarts.join(", ") || "(none)"}
      />
      <DebugRow
        label="Detected @@END markers"
        value={audit.detectedFileEnds.join(", ") || "(none)"}
      />
      <DebugRow
        label="Complete pairs"
        value={audit.completeMarkerPairs.join(", ") || "(none)"}
      />
      <DebugRow
        label="Missing files"
        value={audit.missingFiles.join(", ") || "(none)"}
      />
      <p className="gf-debug__label">Prompt sent ({audit.promptCharCount} chars)</p>
      <pre className="gf-debug__pre">{audit.promptSent}</pre>
      <p className="gf-debug__label">Raw response preview (first 2000 chars)</p>
      <pre className="gf-debug__pre">{audit.rawResponsePreview}</pre>
    </>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="gf-debug__term">{label}</dt>
      <dd className="gf-debug__value">{value}</dd>
    </>
  );
}
