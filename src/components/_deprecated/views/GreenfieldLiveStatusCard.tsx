import type { GreenfieldRunProgress } from "@/core/agent/greenfieldRunProgress";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";

export interface GreenfieldLiveStatusCardProps {
  readonly progress: GreenfieldRunProgress;
  readonly onCancel?: () => void;
  readonly onOpenConsole?: () => void;
  readonly onRetry?: () => void;
  readonly onSwitchProvider?: () => void;
}

export function GreenfieldLiveStatusCard({
  progress,
  onCancel,
  onOpenConsole,
  onRetry,
  onSwitchProvider,
}: GreenfieldLiveStatusCardProps) {
  const showRecovery =
    progress.stuckLevel === "waiting_180" ||
    progress.stuckLevel === "possibly_stuck_5m";

  return (
    <article className="greenfield-live-card" aria-live="polite">
      <header className="greenfield-live-card__head">
        <span className="greenfield-live-card__title">Creating app</span>
        <span className="greenfield-live-card__elapsed">
          {formatGreenfieldElapsed(progress.elapsedMs)}
        </span>
      </header>

      <p className="greenfield-live-card__stage">
        <strong>{progress.currentStageLabel}</strong>
        {progress.provider ? (
          <span className="greenfield-live-card__provider">
            {progress.provider}
            {progress.model ? ` · ${progress.model}` : ""}
          </span>
        ) : null}
      </p>

      {progress.latestEvent ? (
        <p className="greenfield-live-card__event plan__muted">{progress.latestEvent}</p>
      ) : null}

      {progress.stuckMessage ? (
        <p className="greenfield-live-card__stuck" role="status">
          {progress.stuckMessage}
        </p>
      ) : null}

      <ol className="greenfield-live-card__steps">
        {progress.steps.map((step) => (
          <li
            key={step.id}
            className={`greenfield-live-card__step greenfield-live-card__step--${step.status}`}
          >
            <span className="greenfield-live-card__step-label">{step.label}</span>
          </li>
        ))}
      </ol>

      {progress.activity.length > 0 ? (
        <ul className="greenfield-live-card__activity">
          {progress.activity.slice(-4).map((item) => (
            <li
              key={item.id}
              className={`greenfield-live-card__activity-item greenfield-live-card__activity-item--${item.status}`}
            >
              {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="greenfield-live-card__actions">
        {onCancel ? (
          <button type="button" className="prov-btn" onClick={onCancel}>
            Cancel run
          </button>
        ) : null}
        {onOpenConsole ? (
          <button type="button" className="build-view__link" onClick={onOpenConsole}>
            View console
          </button>
        ) : null}
        {showRecovery && onRetry ? (
          <button type="button" className="build-view__link" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {showRecovery && onSwitchProvider ? (
          <button type="button" className="build-view__link" onClick={onSwitchProvider}>
            Switch provider
          </button>
        ) : null}
      </div>
    </article>
  );
}
