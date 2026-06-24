import { useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import type { BuilderApprovalMode, BuilderPhaseStatus } from "@/core/builder/types";
import {
  formatCompletionReportLines,
  roadmapSummaryLines,
} from "@/core/builder";

const MODE_LABELS: Record<BuilderApprovalMode, string> = {
  manual: "Manual — approve every phase",
  hybrid: "Hybrid — approve major phases only",
  autonomous: "Autonomous — run full roadmap",
};

const PHASE_STATUS: Record<BuilderPhaseStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

export function BuilderView() {
  const {
    project,
    builderSession,
    builderError,
    startAutonomousBuild,
    pauseAutonomousBuild,
    resumeAutonomousBuild,
    stopAutonomousBuild,
    approveBuilderPhase,
  } = useWorkspace();

  const [goalInput, setGoalInput] = useState("");
  const [mode, setMode] = useState<BuilderApprovalMode>("hybrid");

  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to run the autonomous app builder."
      />
    );
  }

  const session = builderSession;
  const running =
    session?.status === "running" || session?.status === "awaiting_approval";

  if (!session) {
    return (
      <div className="builder">
        <header className="builder__head">
          <h3 className="builder__title">Autonomous App Builder</h3>
          <p className="plan__muted">
            One prompt chains planning, execution, verification, and repair across
            a generated roadmap.
          </p>
        </header>
        <label className="builder__field">
          <span className="builder__label">Application goal</span>
          <textarea
            className="builder__input"
            rows={3}
            placeholder='e.g. "Build a task manager app"'
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
          />
        </label>
        <label className="builder__field">
          <span className="builder__label">Approval mode</span>
          <select
            className="builder__select"
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as BuilderApprovalMode)
            }
          >
            {(Object.keys(MODE_LABELS) as BuilderApprovalMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        {builderError ? (
          <p className="builder__error" role="alert">
            {builderError}
          </p>
        ) : null}
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={goalInput.trim().length < 4}
          onClick={() => void startAutonomousBuild(goalInput.trim(), mode)}
        >
          Start build
        </button>
      </div>
    );
  }

  const roadmapLines = roadmapSummaryLines(session.phases);
  const reportLines = session.report
    ? formatCompletionReportLines(session.report)
    : null;

  return (
    <div className="builder">
      <header className="builder__head">
        <h3 className="builder__title">{session.goal.title}</h3>
        <p className="plan__muted">{session.goal.rawPrompt}</p>
        <p className="builder__status">
          Status: <strong>{session.status}</strong>
          {session.currentPhaseId
            ? ` · Phase ${session.phases.find((p) => p.id === session.currentPhaseId)?.index! + 1}`
            : null}
        </p>
      </header>

      <div className="builder__controls">
        {session.status === "running" ? (
          <button
            type="button"
            className="prov-btn"
            onClick={() => pauseAutonomousBuild()}
          >
            Pause
          </button>
        ) : null}
        {session.status === "paused" ? (
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() => void resumeAutonomousBuild()}
          >
            Resume
          </button>
        ) : null}
        {session.status === "awaiting_approval" ? (
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() => void approveBuilderPhase()}
          >
            Approve phase & continue
          </button>
        ) : null}
        {running || session.status === "paused" ? (
          <button
            type="button"
            className="prov-btn prov-btn--danger"
            onClick={() => stopAutonomousBuild()}
          >
            Stop build
          </button>
        ) : null}
        {session.status === "ready" ? (
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() => void resumeAutonomousBuild()}
          >
            Run roadmap
          </button>
        ) : null}
      </div>

      {builderError || session.error ? (
        <p className="builder__error" role="alert">
          {builderError ?? session.error}
        </p>
      ) : null}

      <section className="builder__section">
        <h4 className="builder__heading">Roadmap</h4>
        {roadmapLines.map((line) => (
          <p key={line} className="builder__line">
            {line}
          </p>
        ))}
        <ul className="builder__phases">
          {session.phases.map((phase) => (
            <li
              key={phase.id}
              className={`builder__phase builder__phase--${phase.status}${
                session.currentPhaseId === phase.id
                  ? " builder__phase--current"
                  : ""
              }`}
            >
              <span className="builder__phase-status">
                {PHASE_STATUS[phase.status]}
              </span>
              <span className="builder__phase-title">
                Phase {phase.index + 1}: {phase.title}
              </span>
              <span className="builder__phase-desc">{phase.description}</span>
              {phase.filesModified.length > 0 ? (
                <span className="builder__phase-files">
                  Modified: {phase.filesModified.join(", ")}
                </span>
              ) : null}
              {phase.error ? (
                <span className="builder__phase-error">{phase.error}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <dl className="builder__stats">
        <div>
          <dt>Files modified</dt>
          <dd>{session.allFilesModified.length}</dd>
        </div>
        <div>
          <dt>Files created</dt>
          <dd>{session.allFilesCreated.length}</dd>
        </div>
        <div>
          <dt>Completed phases</dt>
          <dd>
            {session.phases.filter((p) => p.status === "completed").length} /{" "}
            {session.phases.length}
          </dd>
        </div>
      </dl>

      {reportLines ? (
        <section className="builder__section builder__report">
          <h4 className="builder__heading">Completion report</h4>
          {reportLines.map((line) => (
            <p key={line} className="builder__line">
              {line}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
