import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import {
  formatExecutionDiagnosticsSummary,
  buildTaskGraph,
} from "@/core/execution";
import type { ExecutionStepStatus } from "@/core/execution/types";

const STEP_STATUS_LABEL: Record<ExecutionStepStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

export function ExecutionView() {
  const {
    project,
    plan,
    aiPlan,
    executionSession,
    executionError,
    startMultiFileExecution,
    runMultiFileExecution,
    cancelMultiFileExecution,
    retryExecutionStep,
    skipExecutionStep,
    regenerateExecutionStep,
  } = useWorkspace();

  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to run coordinated multi-file execution."
      />
    );
  }

  if (!plan) {
    return (
      <EmptyState
        title="No plan yet"
        description="Create a plan in the Plan tab, run AI Plan, then start execution."
      />
    );
  }

  const session = executionSession;
  const aiReady = Boolean(aiPlan?.ok && aiPlan.plan);

  if (!session) {
    return (
      <div className="execution">
        <p className="plan__muted">
          Multi-file execution runs coordinated steps after AI Plan — context
          before consumers, routing after pages, styles last.
        </p>
        {executionError ? (
          <p className="execution__error" role="alert">
            {executionError}
          </p>
        ) : null}
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={!aiReady}
          onClick={() => void startMultiFileExecution()}
        >
          Build execution plan
        </button>
        {!aiReady ? (
          <p className="plan__muted">
            Run <strong>AI Plan</strong> in the plan comparison panel first.
          </p>
        ) : null}
      </div>
    );
  }

  const graph = buildTaskGraph(session.steps);
  const diagLines = formatExecutionDiagnosticsSummary(session);
  const paused = session.phase === "paused";

  return (
    <div className="execution">
      <header className="execution__head">
        <h3 className="execution__title">Multi-file execution</h3>
        <p className="plan__muted">{session.planSummary}</p>
      </header>

      <div className="execution__diag" role="status">
        {diagLines.map((line) => (
          <p key={line} className="execution__diag-line">
            {line}
          </p>
        ))}
      </div>

      <div className="execution__controls">
        {session.phase === "ready" ? (
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() => void runMultiFileExecution()}
          >
            Start execution
          </button>
        ) : null}
        {session.phase === "running" ? (
          <span className="execution__phase">Executing…</span>
        ) : null}
        {session.phase === "verifying" ? (
          <span className="execution__phase">Verifying…</span>
        ) : null}
        {paused ? (
          <>
            <button
              type="button"
              className="prov-btn"
              onClick={() => void retryExecutionStep()}
            >
              Retry step
            </button>
            <button
              type="button"
              className="prov-btn"
              onClick={() => void skipExecutionStep()}
            >
              Skip step
            </button>
            <button
              type="button"
              className="prov-btn"
              onClick={() => void regenerateExecutionStep()}
            >
              Regenerate step
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="prov-btn"
          onClick={() => cancelMultiFileExecution()}
        >
          Cancel
        </button>
      </div>

      {executionError || session.applyError ? (
        <p className="execution__error" role="alert">
          {executionError ?? session.applyError}
        </p>
      ) : null}

      <section className="execution__section">
        <h4 className="execution__heading">Task graph</h4>
        <ul className="execution__graph">
          {graph.nodes.map((node) => (
            <li
              key={node.stepId}
              className={`execution__node execution__node--${node.status}${
                session.currentStepId === node.stepId
                  ? " execution__node--current"
                  : ""
              }`}
            >
              <span className="execution__node-status">
                {STEP_STATUS_LABEL[node.status]}
              </span>
              <span className="execution__node-title">{node.title}</span>
              <span className="execution__node-files">
                {node.files.join(", ") || "—"}
              </span>
              {node.dependsOn.length > 0 ? (
                <span className="execution__node-deps">
                  Depends on: {node.dependsOn.join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="execution__section">
        <h4 className="execution__heading">Files in session</h4>
        <ul className="execution__files">
          {session.files.map((f) => (
            <li key={f.relPath} className={`execution__file execution__file--${f.status}`}>
              <code>{f.relPath}</code>
              <span>{f.status}</span>
              {f.isNewFile ? <span className="execution__badge">new</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
