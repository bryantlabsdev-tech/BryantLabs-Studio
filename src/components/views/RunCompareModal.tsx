import { useMemo } from "react";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { findAgentRunArtifact } from "@/core/agent/agentRunHistory";
import { buildRunCompareViewModel } from "@/core/agent/runCompare";
import type { RunCompareSide } from "@/core/agent/runCompare";
import { formatRunHealthLabel, runHealthClassName } from "@/core/agent/runHealth";
import type { ProjectIntelligence } from "@/core/projectIntelligence/types";

interface RunCompareModalProps {
  readonly leftRunId: string;
  readonly rightRunId: string;
  readonly history: readonly AgentRunArtifact[];
  readonly projectIntelligence?: ProjectIntelligence | null;
  readonly onClose: () => void;
}

function learningsForRun(
  intelligence: ProjectIntelligence | null | undefined,
  runId: string,
): string[] {
  if (!intelligence) return [];
  return intelligence.recentLearnings
    .filter((item) => item.runId === runId)
    .map((item) => item.text);
}

function CompareCell({
  label,
  left,
  right,
}: {
  readonly label: string;
  readonly left: string;
  readonly right: string;
}) {
  const differs = left !== right;
  return (
    <div className={`run-compare__row${differs ? " run-compare__row--diff" : ""}`}>
      <div className="run-compare__label">{label}</div>
      <div className="run-compare__value">{left}</div>
      <div className="run-compare__value">{right}</div>
    </div>
  );
}

function sideValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function renderSideColumn(side: RunCompareSide, heading: string) {
  return (
    <div className="run-compare__column">
      <h4 className="run-compare__column-title">{heading}</h4>
      <p className="run-compare__prompt plan__muted">{side.inspector.prompt}</p>
    </div>
  );
}

export function RunCompareModal({
  leftRunId,
  rightRunId,
  history,
  projectIntelligence = null,
  onClose,
}: RunCompareModalProps) {
  const model = useMemo(() => {
    const left = findAgentRunArtifact(history, leftRunId);
    const right = findAgentRunArtifact(history, rightRunId);
    if (!left || !right) return null;
    return buildRunCompareViewModel(left, right, {
      leftLearnings: learningsForRun(projectIntelligence, leftRunId),
      rightLearnings: learningsForRun(projectIntelligence, rightRunId),
    });
  }, [history, leftRunId, rightRunId, projectIntelligence]);

  if (!model) {
    return (
      <div className="diagnostic-modal__backdrop" role="presentation" onClick={onClose}>
        <div
          className="diagnostic-modal run-compare-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="run-compare-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="diagnostic-modal__head">
            <h3 id="run-compare-title">Compare Runs</h3>
            <button type="button" className="diagnostic-modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <p className="center-panel__hint">One or both runs are no longer available.</p>
        </div>
      </div>
    );
  }

  const { left, right } = model;

  return (
    <div className="diagnostic-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="diagnostic-modal run-compare-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-compare-title"
        data-testid="run-compare-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="diagnostic-modal__head">
          <h3 id="run-compare-title">
            Compare Runs #{left.runNumber} vs #{right.runNumber}
          </h3>
          <button type="button" className="diagnostic-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="run-compare__verdict" role="status">
          {model.moreSuccessfulLabel}
        </p>

        <section className="run-compare__health" aria-label="Health comparison">
          <div className="run-compare__health-card">
            <h4>Run #{left.runNumber}</h4>
            <p className={runHealthClassName(left.health.tone)}>
              {formatRunHealthLabel(left.health)}
            </p>
          </div>
          <div className="run-compare__health-delta">
            <span>Improvement</span>
            <strong>
              {model.healthDelta > 0 ? `+${model.healthDelta}` : model.healthDelta}
            </strong>
            <span className="plan__muted">{model.healthImprovementLabel}</span>
          </div>
          <div className="run-compare__health-card">
            <h4>Run #{right.runNumber}</h4>
            <p className={runHealthClassName(right.health.tone)}>
              {formatRunHealthLabel(right.health)}
            </p>
          </div>
        </section>

        <div className="run-compare__columns">
          {renderSideColumn(left, `Run #${left.runNumber}`)}
          {renderSideColumn(right, `Run #${right.runNumber}`)}
        </div>

        <section className="run-compare__grid" aria-label="Run comparison">
          <div className="run-compare__row run-compare__row--head">
            <div className="run-compare__label">Metric</div>
            <div className="run-compare__value">Run #{left.runNumber}</div>
            <div className="run-compare__value">Run #{right.runNumber}</div>
          </div>
          <CompareCell label="Outcome" left={left.outcome} right={right.outcome} />
          <CompareCell label="Route" left={sideValue(left.route)} right={sideValue(right.route)} />
          <CompareCell
            label="Provider / model"
            left={`${sideValue(left.provider)} / ${sideValue(left.model)}`}
            right={`${sideValue(right.provider)} / ${sideValue(right.model)}`}
          />
          <CompareCell label="Duration" left={left.durationLabel} right={right.durationLabel} />
          <CompareCell label="AI calls" left={String(left.aiCalls)} right={String(right.aiCalls)} />
          <CompareCell
            label="Files modified"
            left={left.filesModified.join(", ") || "—"}
            right={right.filesModified.join(", ") || "—"}
          />
          <CompareCell
            label="Commands run"
            left={left.commandsRun.join(", ") || "—"}
            right={right.commandsRun.join(", ") || "—"}
          />
          <CompareCell label="Planner" left={left.plannerStatus} right={right.plannerStatus} />
          <CompareCell label="Apply" left={left.applyStatus} right={right.applyStatus} />
          <CompareCell
            label="Fallback used"
            left={left.fallbackUsed ? "yes" : "no"}
            right={right.fallbackUsed ? "yes" : "no"}
          />
          <CompareCell
            label="Audit layout"
            left={sideValue(left.auditLayout)}
            right={sideValue(right.auditLayout)}
          />
          <CompareCell
            label="Audit score"
            left={sideValue(left.auditScore)}
            right={sideValue(right.auditScore)}
          />
          <CompareCell
            label="Audit score before/after"
            left={
              left.auditScoreBefore != null
                ? `${left.auditScoreBefore}${left.auditScoreAfter != null ? ` → ${left.auditScoreAfter}` : ""}`
                : "—"
            }
            right={
              right.auditScoreBefore != null
                ? `${right.auditScoreBefore}${right.auditScoreAfter != null ? ` → ${right.auditScoreAfter}` : ""}`
                : "—"
            }
          />
          <CompareCell label="Estimated cost" left={left.estimatedCostLabel} right={right.estimatedCostLabel} />
          <CompareCell label="Error" left={sideValue(left.errorMessage)} right={sideValue(right.errorMessage)} />
        </section>

        <section className="run-compare__section">
          <h4>File diff summary</h4>
          {model.fileDiffSummary.length === 0 ? (
            <p className="plan__muted">No file diffs recorded.</p>
          ) : (
            <ul className="run-compare__list">
              {model.fileDiffSummary.map((item) => (
                <li key={item.path}>
                  <strong>{item.path}</strong> — Run #{left.runNumber}: +{item.leftAdded}/−
                  {item.leftRemoved}; Run #{right.runNumber}: +{item.rightAdded}/−{item.rightRemoved}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="run-compare__section">
          <h4>Timeline differences</h4>
          {model.timelineDiffs.length === 0 ? (
            <p className="plan__muted">No timeline milestones to compare.</p>
          ) : (
            <ul className="run-compare__list">
              {model.timelineDiffs
                .filter((item) => item.leftStatus !== item.rightStatus)
                .map((item) => (
                  <li key={item.label}>
                    {item.label}: Run #{left.runNumber} [{item.leftStatus ?? "—"}] vs Run #
                    {right.runNumber} [{item.rightStatus ?? "—"}]
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="run-compare__section">
          <h4>Timeline comparison</h4>
          <div className="run-compare__timeline-grid">
            <div>
              <h5>Run #{left.runNumber}</h5>
              <ul className="run-compare__list">
                {left.timelineBars.map((item) => (
                  <li key={item.id}>
                    {item.label}: {item.durationLabel}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5>Run #{right.runNumber}</h5>
              <ul className="run-compare__list">
                {right.timelineBars.map((item) => (
                  <li key={item.id}>
                    {item.label}: {item.durationLabel}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="run-compare__section">
          <h4>Learnings comparison</h4>
          {model.learningsOnlyLeft.length === 0 && model.learningsOnlyRight.length === 0 ? (
            <p className="plan__muted">No unique learnings between these runs.</p>
          ) : (
            <div className="run-compare__timeline-grid">
              <div>
                <h5>Run #{left.runNumber}</h5>
                <ul className="run-compare__list">
                  {model.learningsOnlyLeft.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h5>Run #{right.runNumber}</h5>
                <ul className="run-compare__list">
                  {model.learningsOnlyRight.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
