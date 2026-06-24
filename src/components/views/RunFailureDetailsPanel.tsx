import type { RunFailureDetailsViewModel } from "@/core/agent/runFailureDiagnostics";

interface RunFailureDetailsPanelProps {
  readonly details: RunFailureDetailsViewModel;
  /** When true, raw sections stay collapsed and outer title is omitted. */
  readonly embedded?: boolean;
}

function DetailRow({
  label,
  value,
  pre = false,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly pre?: boolean;
}) {
  if (!value?.trim()) return null;
  return (
    <div className="run-failure-details__row">
      <span className="run-failure-details__label">{label}</span>
      {pre ? (
        <pre className="run-failure-details__pre">{value}</pre>
      ) : (
        <span className="run-failure-details__value">{value}</span>
      )}
    </div>
  );
}

export function RunFailureDetailsPanel({
  details,
  embedded = false,
}: RunFailureDetailsPanelProps) {
  return (
    <section
      className={["run-failure-details", embedded ? "run-failure-details--embedded" : ""]
        .filter(Boolean)
        .join(" ")}
      data-testid="run-failure-details"
      aria-label="Failure details"
    >
      {!embedded ? <h4 className="run-failure-details__title">Failure Details</h4> : null}

      <div className="run-failure-details__reason" role="alert">
        <span className="run-failure-details__reason-label">Reason</span>
        <span className="run-failure-details__reason-value">{details.reasonLabel}</span>
      </div>

      <div className="run-failure-details__grid">
        <DetailRow label="Failed stage" value={details.failedStage} />
        <DetailRow label="Provider" value={details.provider} />
        <DetailRow label="Model" value={details.model} />
        <DetailRow label="Duration" value={details.durationLabel} />
        <DetailRow
          label="Files parsed"
          value={
            details.filesParsed != null
              ? `${details.filesParsed} / ${details.filesExpected ?? "7"}`
              : null
          }
        />
        <DetailRow
          label="Missing files"
          value={
            details.missingFiles.length > 0 ? details.missingFiles.join(", ") : null
          }
        />
        <DetailRow label="Last command" value={details.lastCommand} />
      </div>

      <DetailRow label="Error" value={details.rawErrorMessage} pre />

      {details.aiResponsePreview ? (
        <details className="run-failure-details__expand">
          <summary>AI response preview (first 500 chars)</summary>
          <pre className="run-failure-details__pre">{details.aiResponsePreview}</pre>
        </details>
      ) : null}

      {details.commandStdout || details.commandStderr ? (
        <details className="run-failure-details__expand">
          <summary>Command output</summary>
          {details.commandStdout ? (
            <>
              <p className="run-failure-details__subhead">stdout</p>
              <pre className="run-failure-details__pre">{details.commandStdout}</pre>
            </>
          ) : null}
          {details.commandStderr ? (
            <>
              <p className="run-failure-details__subhead">stderr</p>
              <pre className="run-failure-details__pre">{details.commandStderr}</pre>
            </>
          ) : null}
        </details>
      ) : null}

      {details.whatToTryNext.length > 0 ? (
        <div className="run-failure-details__next">
          <p className="run-failure-details__subhead">What to try next</p>
          <ul className="run-failure-details__tips">
            {details.whatToTryNext.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
