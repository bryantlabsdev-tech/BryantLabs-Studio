import type { OperationalActivityStep } from "@/core/agent/deriveAgentOperationalActivity";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";

export function AgentActivityStep({ step }: { readonly step: OperationalActivityStep }) {
  return (
    <li
      className={[
        "agent-activity-step",
        `agent-activity-step--${step.status}`,
      ].join(" ")}
      data-testid={`agent-activity-step-${step.id}`}
      data-status={step.status}
    >
      <div className="agent-activity-step__rail" aria-hidden>
        <span className="agent-activity-step__dot" />
      </div>
      <div className="agent-activity-step__body">
        <div className="agent-activity-step__head">
          <span className="agent-activity-step__label">{step.label}</span>
          {step.elapsedMs != null && step.status === "active" ? (
            <span className="agent-activity-step__elapsed">
              {formatGreenfieldElapsed(step.elapsedMs)}
            </span>
          ) : null}
        </div>
        <p className="agent-activity-step__description">{step.description}</p>
        {step.metadata.length > 0 ? (
          <div className="agent-activity-step__meta">
            {step.metadata.map((chip) => (
              <span key={chip} className="agent-activity-step__chip">
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}
