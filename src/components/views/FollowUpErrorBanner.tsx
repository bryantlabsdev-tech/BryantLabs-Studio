import { useState } from "react";
import type { FollowUpErrorSurface, FollowUpRecoveryActionV2 } from "@/core/build/followUpErrors";

interface FollowUpErrorBannerProps {
  error: FollowUpErrorSurface;
  actions: FollowUpRecoveryActionV2[];
  onAction: (action: FollowUpRecoveryActionV2) => void;
}

function actionLabel(action: FollowUpRecoveryActionV2): string {
  if (action.kind === "retry") return "Retry";
  if (action.kind === "greenfield_recovery") return "Retry setup recovery";
  if (action.kind === "stronger_model") return action.step.label;
  if (action.kind === "switch_provider") return action.label;
  if (action.kind === "open_providers") return "Increase AI limit";
  if (action.kind === "copy_diagnostics") return "Copy Report";
  if (action.kind === "open_diagnostic_report") return "Open Diagnostics";
  if (action.kind === "inspect_run") return "Inspect Run";
  if (action.kind === "view_details") return "View Details";
  return "Action";
}

function actionVariant(action: FollowUpRecoveryActionV2): "primary" | "default" {
  if (
    action.kind === "retry" ||
    action.kind === "greenfield_recovery" ||
    action.kind === "open_diagnostic_report"
  ) {
    return "primary";
  }
  return "default";
}

export function FollowUpErrorBanner({
  error,
  actions,
  onAction,
}: FollowUpErrorBannerProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(error.diagnosticsText);
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  const handleAction = (action: FollowUpRecoveryActionV2) => {
    if (action.kind === "copy_diagnostics") {
      void copyDiagnostics();
      return;
    }
    onAction(action);
  };

  const orderedActions = [...actions].sort((a, b) => {
    const priority = (action: FollowUpRecoveryActionV2) => {
      if (action.kind === "retry" || action.kind === "greenfield_recovery") return 0;
      if (action.kind === "stronger_model") return 1;
      if (action.kind === "open_diagnostic_report") return 2;
      if (action.kind === "inspect_run") return 3;
      if (action.kind === "copy_diagnostics") return 4;
      return 5;
    };
    return priority(a) - priority(b);
  });

  return (
    <div className="follow-up-error-banner" role="alert">
      <p className="follow-up-error-banner__headline">{error.headline}</p>
      {error.rawDetail ? (
        <details
          className="agent-failure-recovery__raw"
          open={rawOpen}
          onToggle={(event) => setRawOpen((event.target as HTMLDetailsElement).open)}
        >
          <summary>Technical details</summary>
          <pre>{error.rawDetail}</pre>
        </details>
      ) : null}
      <div className="follow-up-error-banner__actions">
        {orderedActions.map((action, index) => (
          <button
            key={`${action.kind}-${index}`}
            type="button"
            className={[
              "prov-btn",
              "prov-btn--small",
              actionVariant(action) === "primary" ? "prov-btn--primary" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => handleAction(action)}
          >
            {actionLabel(action)}
          </button>
        ))}
        {copyNote ? <span className="plan__muted">{copyNote}</span> : null}
      </div>
    </div>
  );
}
