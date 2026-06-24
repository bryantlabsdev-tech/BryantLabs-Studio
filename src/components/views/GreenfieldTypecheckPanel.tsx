import { useState } from "react";
import {
  formatTypeScriptDiagnosticsCopy,
  type TypeScriptCheckDetails,
} from "@/core/greenfield/tscDiagnostics";

interface GreenfieldTypecheckPanelProps {
  headline: string;
  details: TypeScriptCheckDetails;
}

/**
 * Greenfield setup TypeScript failure — full command output and parsed diagnostics.
 */
export function GreenfieldTypecheckPanel({
  headline,
  details,
}: GreenfieldTypecheckPanelProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copyDiagnostics = async () => {
    const text = formatTypeScriptDiagnosticsCopy(details);
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  const errors = details.diagnostics.filter((d) => d.category === "error");
  const warnings = details.diagnostics.filter((d) => d.category === "warning");

  return (
    <div className="gf-tsc">
      <p className="aipatch__error">{headline}</p>
      <div className="gf-tsc__actions">
        <button type="button" className="prov-btn" onClick={() => void copyDiagnostics()}>
          Copy TypeScript diagnostics
        </button>
        {copyNote ? <span className="gf-tsc__copynote">{copyNote}</span> : null}
      </div>

      <dl className="gf-tsc__meta">
        <MetaRow label="Command" value={details.command} mono />
        <MetaRow label="Exit code" value={String(details.exitCode ?? "—")} />
        <MetaRow label="Duration" value={`${details.durationMs} ms`} />
        <MetaRow label="Timed out" value={details.timedOut ? "yes" : "no"} />
        <MetaRow label="Output truncated" value={details.truncated ? "yes" : "no"} />
        <MetaRow
          label="Parsed"
          value={`${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}
        />
      </dl>

      {details.diagnostics.length > 0 ? (
        <section className="gf-tsc__section">
          <h5 className="gf-tsc__heading">Diagnostics</h5>
          <ul className="gf-tsc__list">
            {details.diagnostics.map((d, i) => (
              <li key={i} className={`gf-tsc__item gf-tsc__item--${d.category}`}>
                <code className="gf-tsc__loc">
                  {d.file}:{d.line}:{d.column}
                </code>
                <span className={`gf-tsc__code gf-tsc__code--${d.category}`}>
                  {d.code}
                </span>
                <p className="gf-tsc__msg">{d.message}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="gf-tsc__hint">
          No line diagnostics parsed — see raw stdout/stderr below.
        </p>
      )}

      <details className="gf-tsc__stream" open={details.diagnostics.length === 0}>
        <summary>stdout</summary>
        <pre className="gf-tsc__pre">{details.stdout || "(empty)"}</pre>
      </details>
      <details
        className="gf-tsc__stream"
        open={details.stderr.length > 0 && details.diagnostics.length === 0}
      >
        <summary>stderr</summary>
        <pre className="gf-tsc__pre">{details.stderr || "(empty)"}</pre>
      </details>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="gf-tsc__row">
      <dt>{label}</dt>
      <dd className={mono ? "gf-tsc__mono" : undefined}>{value}</dd>
    </div>
  );
}
