import { useState } from "react";
import { GreenfieldTypeScriptDiagnosticsBlock } from "@/components/views/GreenfieldTypeScriptDiagnosticsBlock";
import {
  formatFailureReportCommandOutputCopy,
  formatFailureReportFullCopy,
  formatFailureReportRootCauseCopy,
  type StudioFailureReport,
} from "@/core/diagnostics/failureReport";
import { RUN_LOG_STAGE_LABELS } from "@/core/greenfield/runLog";
import type { RunLogStage } from "@/core/greenfield/runLog";

const STAGE_TO_LOG: Partial<Record<StudioFailureReport["stages"][number]["stage"], RunLogStage>> = {
  patch_propose: "apply_plan",
  write: "apply_plan",
  npm_install: "npm_install",
  typescript: "typescript",
  build: "build",
  preview: "preview",
  verification: "verification",
};

interface StudioFailureDiagnosticsPanelProps {
  report: StudioFailureReport;
  compact?: boolean;
}

export function StudioFailureDiagnosticsPanel({
  report,
  compact = false,
}: StudioFailureDiagnosticsPanelProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(`${label} copied`);
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  const rootStage = report.stages.find((s) => s.role === "root");

  return (
    <div className={`gf-failure-diag${compact ? " gf-failure-diag--compact" : ""}`}>
      <div className="gf-failure-diag__head">
        <h4 className="gf-failure-diag__title">Failure diagnostics</h4>
        <div className="gf-failure-diag__actions">
          <button
            type="button"
            className="prov-btn"
            onClick={() =>
              void copyText("Root cause", formatFailureReportRootCauseCopy(report))
            }
          >
            Copy root cause
          </button>
          <button
            type="button"
            className="prov-btn"
            onClick={() =>
              void copyText("Full diagnostics", formatFailureReportFullCopy(report))
            }
          >
            Copy full diagnostics
          </button>
          <button
            type="button"
            className="prov-btn"
            onClick={() =>
              void copyText(
                "Command output",
                formatFailureReportCommandOutputCopy(report),
              )
            }
          >
            Copy command output
          </button>
          {copyNote ? (
            <span className="gf-failure-diag__copynote">{copyNote}</span>
          ) : null}
        </div>
      </div>

      <div className="gf-summary__root-failure" role="alert">
        <p className="gf-summary__root-failure-label">Root cause</p>
        <p className="gf-summary__root-failure-msg">{report.rootCauseLine}</p>
        {report.rootStage ? (
          <p className="gf-failure-diag__stage-hint">
            First failure: {report.rootStage.replace(/_/g, " ")}
          </p>
        ) : null}
      </div>

      <ol className="gf-failure-diag__stages">
        {report.stages.map((s, i) => (
          <li
            key={`${s.stage}-${i}`}
            className={`gf-failure-diag__stage gf-failure-diag__stage--${s.outcome}${s.role === "root" ? " gf-failure-diag__stage--root" : ""}`}
          >
            <div className="gf-failure-diag__stage-head">
              <span className="gf-failure-diag__stage-name">
                {STAGE_TO_LOG[s.stage]
                  ? RUN_LOG_STAGE_LABELS[STAGE_TO_LOG[s.stage]!]
                  : s.stage}
              </span>
              <span className="gf-failure-diag__stage-outcome">{s.outcome}</span>
              {s.role === "root" ? (
                <span className="gf-failure-diag__role gf-failure-diag__role--root">
                  ROOT FAILURE
                </span>
              ) : s.role === "downstream" ? (
                <span className="gf-failure-diag__role gf-failure-diag__role--downstream">
                  DOWNSTREAM
                </span>
              ) : s.role === "skipped" ? (
                <span className="gf-failure-diag__role">SKIPPED</span>
              ) : null}
            </div>
            <p className="gf-failure-diag__headline">{s.headline}</p>
            {s.detail ? (
              <pre className="gf-failure-diag__detail">{s.detail}</pre>
            ) : null}
            {s.command ? (
              <details className="gf-failure-diag__cmd">
                <summary>Command output ({s.command.command})</summary>
                <pre className="gf-tsc__pre">
                  {`exit ${s.command.exitCode ?? "—"} · ${s.command.durationMs}ms\n\n--- stdout ---\n${s.command.stdout || "(empty)"}\n\n--- stderr ---\n${s.command.stderr || "(empty)"}`}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ol>

      {rootStage?.typecheckDetails ? (
        <GreenfieldTypeScriptDiagnosticsBlock details={rootStage.typecheckDetails} />
      ) : null}
    </div>
  );
}
