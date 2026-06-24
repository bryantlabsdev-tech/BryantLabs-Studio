import { useState } from "react";
import type { ExecutionDashboardUiAuditAdvisory } from "@/core/agent/executionDashboard";
import {
  advisoryDetailsVisible,
  buildUiAuditAdvisoryDetailLines,
  formatAdvisoryVerificationCollapsedLabel,
  hasFixableUiAuditAdvisory,
  isUiAuditAdvisoryFixDisabled,
  toggleAdvisoryExpanded,
  uiAuditAdvisoryFixButtonLabel,
} from "@/core/agent/uiAuditAdvisoryUx";

export interface UiAuditAdvisoryVerificationRowProps {
  readonly advisory: ExecutionDashboardUiAuditAdvisory;
  readonly label?: string;
  readonly defaultExpanded?: boolean;
  readonly expanded?: boolean;
  readonly onExpandedChange?: (expanded: boolean) => void;
  readonly onFixWithAi?: () => void;
  readonly runActive?: boolean;
  readonly fixRunning?: boolean;
}

export function UiAuditAdvisoryVerificationRow({
  advisory,
  label = "UI Audit",
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
  onFixWithAi,
  runActive = false,
  fixRunning = false,
}: UiAuditAdvisoryVerificationRowProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = expandedProp ?? internalExpanded;
  const details = buildUiAuditAdvisoryDetailLines(advisory);
  const showDetails = advisoryDetailsVisible(expanded);
  const showFixButton = hasFixableUiAuditAdvisory(advisory) && Boolean(onFixWithAi);
  const fixing = fixRunning || runActive;
  const fixDisabled = isUiAuditAdvisoryFixDisabled({ runActive, fixRunning });
  const fixLabel = uiAuditAdvisoryFixButtonLabel(fixing);

  const setExpanded = (next: boolean) => {
    if (expandedProp === undefined) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  };

  const handleToggle = () => {
    setExpanded(toggleAdvisoryExpanded(expanded));
  };

  return (
    <li
      className="exec-dash__verification-row exec-dash__verification-row--advisory exec-dash__verification-row--expandable"
      data-testid="exec-dash-ui-audit-advisory-row"
      data-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        className="exec-dash__advisory-toggle"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls="exec-dash-ui-audit-advisory-details"
        data-testid="exec-dash-ui-audit-advisory-toggle"
      >
        <span className="exec-dash__advisory-summary">
          {formatAdvisoryVerificationCollapsedLabel(label, advisory.score)}
        </span>
        <span className="exec-dash__advisory-chevron" aria-hidden="true">
          {expanded ? "▲" : "▼"} Details
        </span>
      </button>
      {showDetails ? (
        <div
          id="exec-dash-ui-audit-advisory-details"
          className="exec-dash__advisory-details"
          data-testid="exec-dash-ui-audit-advisory-details"
        >
          <p>
            <span className="exec-dash__ui-audit-label">Layout:</span> {details.layout}
          </p>
          <p>
            <span className="exec-dash__ui-audit-label">Score:</span> {details.score}
          </p>
          {details.issues.length > 0 ? (
            <div className="exec-dash__advisory-issues">
              <span className="exec-dash__ui-audit-label">Issues:</span>
              <ul className="exec-dash__advisory-issue-list">
                {details.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="exec-dash__advisory-recommendations">
            <span className="exec-dash__ui-audit-label">Recommendation:</span>
            {details.recommendations.length === 1 ? (
              <p className="exec-dash__advisory-recommendation-text">
                {details.recommendations[0]}
              </p>
            ) : (
              <ul className="exec-dash__advisory-recommendation-list">
                {details.recommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ul>
            )}
          </div>
          {showFixButton ? (
            <button
              type="button"
              className="exec-dash__advisory-fix-btn"
              onClick={onFixWithAi}
              disabled={fixDisabled}
              data-testid="exec-dash-ui-audit-fix-btn"
            >
              {fixLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
