import type {
  UiAuditFailureDiagnostics,
  UiAuditIssueDiagnostic,
} from "@/core/greenfield/uiAudit/types";

export interface UiAuditFailureDiagnosticsPanelProps {
  readonly diagnostics: UiAuditFailureDiagnostics;
  readonly compact?: boolean;
}

function IssueDetail({ issue }: { readonly issue: UiAuditIssueDiagnostic }) {
  return (
    <li className="ui-audit-diagnostics__issue">
      <p className="ui-audit-diagnostics__issue-code">{issue.issue.replace(/_/g, " ")}</p>
      <p>
        <span className="ui-audit-diagnostics__label">Reason:</span> {issue.reason}
      </p>
      <p>
        <span className="ui-audit-diagnostics__label">Suggested fix:</span> {issue.suggestedFix}
      </p>
    </li>
  );
}

export function UiAuditFailureDiagnosticsPanel({
  diagnostics,
  compact = false,
}: UiAuditFailureDiagnosticsPanelProps) {
  return (
    <section
      className={`ui-audit-diagnostics${compact ? " ui-audit-diagnostics--compact" : ""}`}
      data-testid="ui-audit-failure-diagnostics"
      aria-label={diagnostics.title}
    >
      <h4 className="ui-audit-diagnostics__title">{diagnostics.title}</h4>
      <dl className="ui-audit-diagnostics__grid">
        <div className="ui-audit-diagnostics__row">
          <dt>What failed</dt>
          <dd>{diagnostics.whatFailed}</dd>
        </div>
        <div className="ui-audit-diagnostics__row">
          <dt>Reason</dt>
          <dd>{diagnostics.reason}</dd>
        </div>
        <div className="ui-audit-diagnostics__row">
          <dt>Suggested fix</dt>
          <dd>{diagnostics.suggestedFix}</dd>
        </div>
        {!compact ? (
          <>
            <div className="ui-audit-diagnostics__row">
              <dt>Layout</dt>
              <dd>{diagnostics.layoutType.replace(/_/g, " ")}</dd>
            </div>
            <div className="ui-audit-diagnostics__row">
              <dt>Score</dt>
              <dd>{diagnostics.score}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {!compact && diagnostics.issueDetails.length > 1 ? (
        <>
          <p className="ui-audit-diagnostics__subheading">All issues</p>
          <ul className="ui-audit-diagnostics__issues">
            {diagnostics.issueDetails.map((issue) => (
              <IssueDetail key={issue.issue} issue={issue} />
            ))}
          </ul>
        </>
      ) : null}

      {!compact ? (
        <details className="ui-audit-diagnostics__raw">
          <summary>Raw audit codes</summary>
          <p className="ui-audit-diagnostics__mono">{diagnostics.rawIssueCodes.join(", ")}</p>
          <p className="ui-audit-diagnostics__mono">{diagnostics.rawDetails}</p>
        </details>
      ) : null}
    </section>
  );
}
