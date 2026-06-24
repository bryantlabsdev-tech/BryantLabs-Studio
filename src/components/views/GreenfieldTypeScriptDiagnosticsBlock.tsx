import { useState } from "react";
import {
  formatTypeScriptDiagnosticsSummarySection,
  type TypeScriptCheckDetails,
  type TypeScriptDiagnostic,
} from "@/core/greenfield/tscDiagnostics";

interface GreenfieldTypeScriptDiagnosticsBlockProps {
  details: TypeScriptCheckDetails;
}

/**
 * TypeScript failure report — diagnostics, stdout/stderr, granular copy actions.
 */
export function GreenfieldTypeScriptDiagnosticsBlock({
  details,
}: GreenfieldTypeScriptDiagnosticsBlockProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(label);
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  const errors = details.diagnostics.filter((d) => d.category === "error");
  const warnings = details.diagnostics.filter((d) => d.category === "warning");
  const primary = errors[0] ?? details.diagnostics[0];

  return (
    <section className="gf-summary__tsc">
      <h4 className="gf-summary__tsc-title">TypeScript Diagnostics</h4>
      <hr className="gf-summary__tsc-rule" />

      <p className="gf-summary__tsc-count">
        {errors.length} error{errors.length === 1 ? "" : "s"}
        {warnings.length > 0
          ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
          : ""}
      </p>

      {primary ? (
        <div className="gf-summary__tsc-primary">
          <p className="gf-summary__tsc-primary-label">First error</p>
          <DiagnosticFields d={primary} />
        </div>
      ) : (
        <p className="gf-summary__tsc-hint">
          No line diagnostics parsed — see stdout and stderr below.
        </p>
      )}

      {details.diagnostics.length > 1 ? (
        <div className="gf-summary__tsc-all">
          <h5 className="gf-summary__tsc-subhead">
            All diagnostics ({details.diagnostics.length})
          </h5>
          <ul className="gf-tsc__list">
            {details.diagnostics.map((d, i) => (
              <li
                key={i}
                className={`gf-tsc__item gf-tsc__item--${d.category}${i === 0 && primary ? " gf-tsc__item--primary" : ""}`}
              >
                <DiagnosticFields d={d} compact />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="gf-summary__tsc-streams">
        <StreamBlock label="stdout" text={details.stdout} />
        <StreamBlock label="stderr" text={details.stderr} />
      </div>

      <div className="gf-tsc__actions">
        <button
          type="button"
          className="prov-btn"
          onClick={() =>
            void copyText(
              formatTypeScriptDiagnosticsSummarySection(details),
              "Diagnostics copied",
            )
          }
        >
          Copy diagnostics
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() => void copyText(details.stdout || "", "stdout copied")}
        >
          Copy stdout
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() => void copyText(details.stderr || "", "stderr copied")}
        >
          Copy stderr
        </button>
        {copyNote ? <span className="gf-tsc__copynote">{copyNote}</span> : null}
      </div>
    </section>
  );
}

function DiagnosticFields({
  d,
  compact,
}: {
  d: TypeScriptDiagnostic;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <dl className="gf-summary__tsc-fields gf-summary__tsc-fields--compact">
        <Field label="File" value={d.file} mono />
        <Field label="Line" value={String(d.line)} />
        <Field label="Column" value={String(d.column)} />
        <Field label="Code" value={d.code} code={d.category} />
        <Field label="Message" value={d.message} />
      </dl>
    );
  }
  return (
    <dl className="gf-summary__tsc-fields">
      <Field label="File" value={d.file} mono />
      <Field label="Line" value={String(d.line)} />
      <Field label="Column" value={String(d.column)} />
      <Field label="Code" value={d.code} code={d.category} />
      <Field label="Message" value={d.message} />
    </dl>
  );
}

function Field({
  label,
  value,
  mono,
  code,
}: {
  label: string;
  value: string;
  mono?: boolean;
  code?: "error" | "warning";
}) {
  return (
    <div className="gf-summary__tsc-field">
      <dt>{label}</dt>
      <dd
        className={[
          mono ? "gf-summary__mono" : "",
          code ? `gf-tsc__code gf-tsc__code--${code}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function StreamBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="gf-summary__tsc-stream">
      <h5 className="gf-summary__tsc-subhead">{label}:</h5>
      <pre className="gf-tsc__pre">{text || "(empty)"}</pre>
    </div>
  );
}
