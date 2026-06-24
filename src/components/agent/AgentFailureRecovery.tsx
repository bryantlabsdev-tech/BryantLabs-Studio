import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { RunFailureDetailsViewModel } from "@/core/agent/runFailureDiagnostics";
import { RunFailureDetailsPanel } from "@/components/views/RunFailureDetailsPanel";

export interface AgentFailureRecoveryProps {
  readonly headline: string;
  readonly whatHappened: string;
  readonly whyLikely: string | null;
  readonly recommendedAction: string | null;
  readonly failureDetails?: RunFailureDetailsViewModel | null;
  readonly onRetry?: () => void;
  readonly onRetryStronger?: () => void;
  readonly onOpenDiagnostics?: () => void;
  readonly onInspectRun?: () => void;
  readonly onCopyReport?: () => void;
  readonly strongerModelLabel?: string | null;
}

export function AgentFailureRecovery({
  headline,
  whatHappened,
  whyLikely,
  recommendedAction,
  failureDetails = null,
  onRetry,
  onRetryStronger,
  onOpenDiagnostics,
  onInspectRun,
  onCopyReport,
  strongerModelLabel,
}: AgentFailureRecoveryProps) {
  return (
    <section className="agent-failure-recovery" data-testid="agent-failure-recovery">
      <div className="agent-failure-recovery__head">
        <h4 className="agent-failure-recovery__headline">{headline}</h4>
        <p className="agent-failure-recovery__section">
          <span className="agent-failure-recovery__section-label">What happened</span>
          {whatHappened}
        </p>
        {whyLikely ? (
          <p className="agent-failure-recovery__section">
            <span className="agent-failure-recovery__section-label">Why it likely happened</span>
            {whyLikely}
          </p>
        ) : null}
        {recommendedAction ? (
          <p className="agent-failure-recovery__section">
            <span className="agent-failure-recovery__section-label">Recommended next step</span>
            {recommendedAction}
          </p>
        ) : null}
      </div>

      <div className="agent-failure-recovery__actions">
        {onRetry ? (
          <button type="button" className="prov-btn prov-btn--primary" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {onRetryStronger ? (
          <button type="button" className="prov-btn" onClick={onRetryStronger}>
            {strongerModelLabel ?? "Retry with stronger model"}
          </button>
        ) : null}
        {onOpenDiagnostics ? (
          <button type="button" className="prov-btn" onClick={onOpenDiagnostics}>
            Open Diagnostics
          </button>
        ) : null}
        {onInspectRun ? (
          <button type="button" className="prov-btn" onClick={onInspectRun}>
            Inspect Run
          </button>
        ) : null}
        {onCopyReport ? (
          <button type="button" className="prov-btn" onClick={() => void onCopyReport()}>
            Copy Report
          </button>
        ) : null}
      </div>

      {failureDetails ? (
        <details className="agent-failure-recovery__raw">
          <summary>Technical details</summary>
          <RunFailureDetailsPanel details={failureDetails} embedded />
        </details>
      ) : null}
    </section>
  );
}

export function buildFailureRecoveryCopy(input: {
  readonly card: AgentRunCardViewModel;
  readonly failureDetails: RunFailureDetailsViewModel | null;
  readonly failureReason: string | null;
  readonly suggestedFix: string | null;
}): {
  headline: string;
  whatHappened: string;
  whyLikely: string | null;
  recommendedAction: string | null;
} {
  const { card, failureDetails, failureReason, suggestedFix } = input;
  const headline =
    failureDetails?.headline ??
    card.failureDiagnosis?.title ??
    card.diagnostics.items[0]?.title ??
    "The agent run did not complete successfully";

  const whatHappened =
    failureDetails?.summaryLine ??
    failureReason ??
    card.failureDiagnosis?.reason ??
    "Something went wrong while the agent was working on your request.";

  const whyLikely =
    card.failureDiagnosis?.rootCause ??
    failureDetails?.reasonLabel ??
    card.diagnostics.items[0]?.reason ??
    null;

  const recommendedAction =
    suggestedFix ??
    failureDetails?.whatToTryNext[0] ??
    card.failureDiagnosis?.suggestedFix ??
    card.diagnostics.items[0]?.suggestedFix ??
    "Review the diagnostics, adjust your prompt, and retry.";

  return { headline, whatHappened, whyLikely, recommendedAction };
}

export function inferFailureStageLabel(
  card: AgentRunCardViewModel,
): string | null {
  const failedStep = card.steps.find((step) => step.status === "failed");
  if (failedStep) return failedStep.label;
  return card.currentStep?.label ?? null;
}
