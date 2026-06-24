import { useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { computeAgentSuccessMetrics } from "@/core/agent/agentSuccessMetrics";
import {
  computeCostScopeSummary,
  formatCostDisplay,
} from "@/core/analytics/runCostEstimate";
import { formatDuration, formatPercent } from "@/core/analytics/costEstimates";
import { SESSION_RUN_HISTORY_SCOPE } from "@/core/agent/agentRunHistory";

function metricValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function AgentRunMetricsView() {
  const { agentRunHistory, project } = useWorkspace();

  const projectArtifacts = agentRunHistory;
  const sessionArtifacts = useMemo(
    () =>
      project?.path
        ? agentRunHistory
        : agentRunHistory.filter(
            () => true, // session scope already isolated in storage when no project
          ),
    [agentRunHistory, project?.path],
  );

  const metrics = useMemo(
    () => computeAgentSuccessMetrics(projectArtifacts),
    [projectArtifacts],
  );

  const costs = useMemo(
    () =>
      computeCostScopeSummary({
        projectArtifacts,
        sessionArtifacts: project?.path ? projectArtifacts : sessionArtifacts,
      }),
    [projectArtifacts, project?.path, sessionArtifacts],
  );

  return (
    <div className="agent-run-metrics" data-testid="agent-run-metrics">
      <header className="agent-run-metrics__head">
        <h3>Agent Success Metrics</h3>
        <p className="plan__muted">
          Lightweight rollups from run history
          {project?.path ? ` for ${project.name}` : " (session)"}.
        </p>
      </header>

      <dl className="agent-run-metrics__grid run-inspector__metrics">
        <div>
          <dt>Total runs</dt>
          <dd>{metrics.totalRuns}</dd>
        </div>
        <div>
          <dt>Success rate</dt>
          <dd>{formatPercent(metrics.successRate)}</dd>
        </div>
        <div>
          <dt>Failure rate</dt>
          <dd>{formatPercent(metrics.failureRate)}</dd>
        </div>
        <div>
          <dt>Planner success rate</dt>
          <dd>
            {metrics.plannerSuccessRate != null
              ? formatPercent(metrics.plannerSuccessRate)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Apply success rate</dt>
          <dd>
            {metrics.applySuccessRate != null
              ? formatPercent(metrics.applySuccessRate)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Verification success rate</dt>
          <dd>
            {metrics.verificationSuccessRate != null
              ? formatPercent(metrics.verificationSuccessRate)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Fallback saves</dt>
          <dd>{metrics.fallbackSaves}</dd>
        </div>
        <div>
          <dt>Average duration</dt>
          <dd>{formatDuration(metrics.averageDurationMs)}</dd>
        </div>
        <div>
          <dt>Average AI calls</dt>
          <dd>{metricValue(metrics.averageAiCalls)}</dd>
        </div>
        <div>
          <dt>Files modified total</dt>
          <dd>{metrics.filesModifiedTotal}</dd>
        </div>
      </dl>

      <section className="agent-run-metrics__costs">
        <h4>Estimated cost</h4>
        <dl className="agent-run-metrics__grid run-inspector__metrics">
          <div>
            <dt>Session cost</dt>
            <dd>{formatCostDisplay(costs.sessionCostUsd)}</dd>
          </div>
          <div>
            <dt>Project cost</dt>
            <dd>{formatCostDisplay(costs.projectCostUsd)}</dd>
          </div>
          <div>
            <dt>Daily cost</dt>
            <dd>{formatCostDisplay(costs.dailyCostUsd)}</dd>
          </div>
        </dl>
        {!project?.path ? (
          <p className="plan__muted">
            Session scope: {SESSION_RUN_HISTORY_SCOPE}. Open a project for project-level totals.
          </p>
        ) : null}
      </section>
    </div>
  );
}
