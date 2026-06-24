import type { ReactNode } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";

function DenseBlock({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="agent-run-card__dense-block">
      <div className="agent-run-card__dense-label">{label}</div>
      <div className="agent-run-card__dense-body">{children}</div>
    </div>
  );
}

export function RunConfidenceBadge({
  confidence,
}: {
  readonly confidence: AgentRunCardViewModel["confidence"];
}) {
  if (confidence.percent <= 0) return null;
  return (
    <span
      className={`agent-run-card__confidence-badge agent-run-card__confidence--${confidence.level}`}
      data-testid="agent-run-confidence"
      title={confidence.factors.map((f) => f.text).join(" · ")}
    >
      {confidence.percent}%
    </span>
  );
}

export function RunReasoningPanel({
  viewModel,
}: {
  readonly viewModel: AgentRunCardViewModel;
}) {
  const { reasoning, confidence } = viewModel;
  if (!reasoning.isVisible) return null;

  return (
    <div className="run-conversation__insight-panel" data-testid="agent-run-reasoning">
      {reasoning.headline ? (
        <p className="agent-run-card__reasoning-headline">{reasoning.headline}</p>
      ) : null}

      {reasoning.plannerReasoning.length > 0 ? (
        <DenseBlock label="Planner reasoning">
          <ul className="agent-run-card__dense-list">
            {reasoning.plannerReasoning.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}

      {reasoning.detected.length > 0 ? (
        <DenseBlock label="Detected">
          <ul className="agent-run-card__dense-list">
            {reasoning.detected.map((item) => (
              <li key={item.text}>
                {item.ok ? "✓" : "⚠"} {item.text}
              </li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}

      {reasoning.planSteps.length > 0 ? (
        <DenseBlock label="Plan">
          <ol className="agent-run-card__dense-list agent-run-card__dense-list--ordered">
            {reasoning.planSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </DenseBlock>
      ) : null}

      {confidence.percent > 0 ? (
        <DenseBlock label="Confidence">
          <p className="agent-run-card__dense-inline">
            <strong>{confidence.percent}%</strong>
            <span className="agent-run-card__dense-muted"> · {confidence.level}</span>
          </p>
          {confidence.factors.length > 0 ? (
            <ul className="agent-run-card__dense-list agent-run-card__dense-list--compact">
              {confidence.factors.slice(0, 4).map((factor) => (
                <li key={factor.text}>
                  {factor.positive ? "✓" : "⚠"} {factor.text}
                </li>
              ))}
            </ul>
          ) : null}
        </DenseBlock>
      ) : null}

      {reasoning.risks.length > 0 ? (
        <DenseBlock label="Risks">
          <ul className="agent-run-card__dense-list">
            {reasoning.risks.map((risk) => (
              <li key={risk}>⚠ {risk}</li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}
    </div>
  );
}

export function RunPatchImpactPanel({
  viewModel,
}: {
  readonly viewModel: AgentRunCardViewModel;
}) {
  const { patchImpact } = viewModel;
  if (!patchImpact.isVisible || patchImpact.files.length === 0) return null;

  return (
    <div className="run-conversation__insight-panel" data-testid="agent-run-patch-impact">
      <DenseBlock label="Files to modify">
        <ul className="agent-run-card__impact-files">
          {patchImpact.files.map((file) => (
            <li key={file.path} className="agent-run-card__impact-file">
              <span>{file.path}</span>
              <span className="agent-run-card__impact-stats">
                +{file.added} / −{file.removed}
              </span>
            </li>
          ))}
        </ul>
        <p className="agent-run-card__dense-inline agent-run-card__dense-muted">
          {patchImpact.complexity} complexity · {patchImpact.risk} risk ·{" "}
          {patchImpact.estimatedTime}
        </p>
      </DenseBlock>
    </div>
  );
}
