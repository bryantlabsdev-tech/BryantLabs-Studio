import { useMemo, useState } from "react";
import { GreenfieldTypeScriptDiagnosticsBlock } from "@/components/views/GreenfieldTypeScriptDiagnosticsBlock";
import {
  buildFailureInvestigation,
  formatNpmInstallLog,
  formatVerificationReport,
  INVESTIGATION_FILE_PATHS,
} from "@/core/greenfield/failureInvestigation";
import type { GeneratedFile, GreenfieldSetupResult } from "@/core/greenfield/types";
import {
  formatTypeScriptDiagnosticsCopy,
  resolveTypecheckDetails,
} from "@/core/greenfield/tscDiagnostics";

interface GreenfieldFailureInvestigationPanelProps {
  setupResult: GreenfieldSetupResult;
  generatedFiles: readonly GeneratedFile[] | null | undefined;
  targetFolder?: string | null;
  headline?: string | null;
}

export function GreenfieldFailureInvestigationPanel({
  setupResult,
  generatedFiles,
  targetFolder,
  headline,
}: GreenfieldFailureInvestigationPanelProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const typecheckDetails = useMemo(
    () => resolveTypecheckDetails(setupResult),
    [setupResult],
  );

  const investigation = useMemo(
    () =>
      buildFailureInvestigation({
        setupResult,
        generatedFiles,
        typecheckDetails,
      }),
    [setupResult, generatedFiles, typecheckDetails],
  );

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(label);
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  if (!investigation) return null;

  const verificationReport = formatVerificationReport({
    setupResult,
    investigation,
    ...(targetFolder !== undefined ? { targetFolder } : {}),
    ...(headline !== undefined ? { headline } : {}),
    ...(typecheckDetails !== undefined ? { typecheckDetails } : {}),
  });

  return (
    <section className="gf-failure">
      <div className="gf-failure__head">
        <h4 className="gf-failure__title">Failure investigation</h4>
        <div className="gf-tsc__actions">
          <button
            type="button"
            className="prov-btn"
            onClick={() => void copyText("Report copied", verificationReport)}
          >
            Copy verification report
          </button>
          <button
            type="button"
            className="prov-btn"
            onClick={() =>
              void copyText(
                "npm log copied",
                formatNpmInstallLog(setupResult.install),
              )
            }
          >
            Copy npm install log
          </button>
          {typecheckDetails ? (
            <button
              type="button"
              className="prov-btn"
              onClick={() =>
                void copyText(
                  "TS diagnostics copied",
                  formatTypeScriptDiagnosticsCopy(typecheckDetails),
                )
              }
            >
              Copy TypeScript diagnostics
            </button>
          ) : null}
          {copyNote ? <span className="gf-tsc__copynote">{copyNote}</span> : null}
        </div>
      </div>

      {investigation.firstError ? (
        <div className="gf-failure__first">
          <p className="gf-failure__first-label">First real error</p>
          <dl className="gf-summary__tsc-fields">
            <div className="gf-summary__tsc-field">
              <dt>File</dt>
              <dd className="gf-summary__mono">{investigation.firstError.file}</dd>
            </div>
            <div className="gf-summary__tsc-field">
              <dt>Line</dt>
              <dd>{investigation.firstError.line}</dd>
            </div>
            <div className="gf-summary__tsc-field">
              <dt>Column</dt>
              <dd>{investigation.firstError.column}</dd>
            </div>
            <div className="gf-summary__tsc-field">
              <dt>Code</dt>
              <dd className="gf-tsc__code gf-tsc__code--error">
                {investigation.firstError.code}
              </dd>
            </div>
            <div className="gf-summary__tsc-field">
              <dt>Message</dt>
              <dd>{investigation.firstError.message}</dd>
            </div>
          </dl>
          <p className="gf-failure__hint">
            Later errors (e.g. 49 total) are often cascading from this root cause.
          </p>
        </div>
      ) : null}

      <div className="gf-failure__section">
        <h5 className="gf-failure__subhead">
          Files with errors ({investigation.errorFiles.length})
        </h5>
        {investigation.errorFiles.length ? (
          <ul className="gf-failure__files">
            {investigation.errorFiles.map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gf-failure__hint">No per-file diagnostics parsed — see logs below.</p>
        )}
      </div>

      {investigation.corruption.length > 0 ? (
        <div className="gf-failure__section">
          <h5 className="gf-failure__subhead">Generation corruption checks</h5>
          <ul className="gf-failure__corruption">
            {investigation.corruption.map((c, i) => (
              <li key={i}>
                <strong>{c.path}</strong> — {c.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="gf-failure__hint">
          No @vitejs/plugin-react leak, vite.config leak, or @@FILE markers in stored
          generated files.
        </p>
      )}

      <details className="gf-failure__stream" open>
        <summary>npm install — full stdout / stderr</summary>
        <pre className="gf-tsc__pre">
          {formatNpmInstallLog(setupResult.install)}
        </pre>
      </details>

      {typecheckDetails ? (
        <GreenfieldTypeScriptDiagnosticsBlock details={typecheckDetails} />
      ) : setupResult.typecheck ? (
        <details className="gf-failure__stream" open>
          <summary>TypeScript — raw output</summary>
          <pre className="gf-tsc__pre">
            {[setupResult.typecheck.stdout, setupResult.typecheck.stderr]
              .filter(Boolean)
              .join("\n") || "(empty)"}
          </pre>
        </details>
      ) : null}

      <div className="gf-failure__section">
        <h5 className="gf-failure__subhead">Generated files (review)</h5>
        {INVESTIGATION_FILE_PATHS.map((path) => {
          const snippet = investigation.generatedSnippets.find((s) => s.path === path);
          return (
            <details key={path} className="gf-failure__filebox">
              <summary>
                <code>{path}</code>
              </summary>
              <pre className="gf-tsc__pre">{snippet?.content ?? "(missing)"}</pre>
            </details>
          );
        })}
      </div>
    </section>
  );
}
