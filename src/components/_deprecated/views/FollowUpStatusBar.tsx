import { explicitWaitingLabel } from "@/core/build/waitingStates";
import { formatElapsedDuration, type FollowUpRunStatus } from "@/core/build/followUpRun";

interface FollowUpStatusBarProps {
  status: FollowUpRunStatus;
  onCancel: () => void;
}

export function FollowUpStatusBar({ status, onCancel }: FollowUpStatusBarProps) {
  if (status.phase === "idle" && !status.isActive && !status.escalationNote) return null;

  const showBar =
    status.isActive || status.phase === "done" || status.phase === "failed" || status.escalationNote;
  if (!showBar) return null;

  return (
    <section
      className={`follow-up-status follow-up-status--${status.phase}`}
      aria-live="polite"
      aria-label="Agent run status"
    >
      <div className="follow-up-status__head">
        <div>
          <span className="follow-up-status__phase">
            {status.waitingLabel || explicitWaitingLabel(status.phase)}
          </span>
          <span className="follow-up-status__progress">
            Progress: {status.progressPercent}%
          </span>
        </div>
        {status.isActive ? (
          <button type="button" className="prov-btn prov-btn--small" onClick={onCancel}>
            Cancel Run
          </button>
        ) : null}
      </div>

      {status.escalationNote ? (
        <p className="follow-up-status__escalation">{status.escalationNote}</p>
      ) : null}

      <div className="follow-up-status__grid">
        <div className="follow-up-status__cell">
          <span className="follow-up-status__label">Current</span>
          <span className="follow-up-status__value">{status.currentLabel}</span>
        </div>
        {status.nextLabel ? (
          <div className="follow-up-status__cell">
            <span className="follow-up-status__label">Next</span>
            <span className="follow-up-status__value follow-up-status__value--muted">
              {status.nextLabel}
            </span>
          </div>
        ) : null}
        <div className="follow-up-status__cell">
          <span className="follow-up-status__label">Elapsed</span>
          <span className="follow-up-status__value">
            {formatElapsedDuration(status.elapsedMs)}
          </span>
        </div>
        {status.provider ? (
          <div className="follow-up-status__cell">
            <span className="follow-up-status__label">Provider</span>
            <span className="follow-up-status__value">{status.provider}</span>
          </div>
        ) : null}
        {status.model ? (
          <div className="follow-up-status__cell">
            <span className="follow-up-status__label">Model</span>
            <span className="follow-up-status__value">{status.model}</span>
          </div>
        ) : null}
      </div>

      <div
        className="follow-up-status__bar"
        role="progressbar"
        aria-valuenow={status.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className="follow-up-status__bar-fill"
          style={{ width: `${status.progressPercent}%` }}
        />
      </div>
    </section>
  );
}
