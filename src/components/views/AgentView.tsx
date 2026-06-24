import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import { BRYANTLABS_AGENT_DISPLAY_NAME } from "@/core/studioRun/types";
import { buildAgentReport } from "@/core/agentWorkspace";
import { AgentCopyBar } from "@/components/views/AgentCopyBar";
import type { AgentFeedKind } from "@/core/agentWorkspace/types";

function formatBryantLabsAgentStatus(status: string): string {
  if (status === "awaiting_approval") return "awaiting approval";
  if (status === "running") return "running";
  if (status === "paused") return "paused";
  if (status === "stopped") return "stopped";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return status.replace(/_/g, " ");
}

const FEED_LABEL: Record<AgentFeedKind, string> = {
  thinking: "Thinking",
  planning: "Planning",
  executing: "Executing",
  verifying: "Verifying",
  repairing: "Repairing",
  completed: "Completed",
};

export function AgentView() {
  const {
    project,
    agentSession,
    agentLoopSession,
    agentLoopError,
    agentStartBlockReason,
    agentStartDisabled,
    startAgent,
    pauseAgent,
    resumeAgent,
    stopAgent,
    approveAgentAction,
    builderSession,
    executionSession,
    pauseAutonomousBuild,
    resumeAutonomousBuild,
    stopAutonomousBuild,
    approveBuilderPhase,
    retryExecutionStep,
    skipExecutionStep,
    clearAgentSession,
  } = useWorkspace();

  const [goalInput, setGoalInput] = useState("");

  const feed = useMemo(
    () => [...(agentSession?.feed ?? [])].reverse(),
    [agentSession?.feed],
  );

  const reasoning = useMemo(
    () => [...(agentSession?.reasoning ?? [])].reverse(),
    [agentSession?.reasoning],
  );

  const agentRunning =
    agentLoopSession?.status === "running" ||
    agentLoopSession?.status === "awaiting_approval";
  const agentPaused = agentLoopSession?.status === "paused";
  const agentAwaiting = agentLoopSession?.status === "awaiting_approval";

  const builderRunning =
    builderSession?.status === "running" ||
    builderSession?.status === "awaiting_approval";
  const builderPaused = builderSession?.status === "paused";
  const executionPaused = executionSession?.phase === "paused";
  const canPause = builderRunning || agentRunning;
  const canResume = builderPaused || agentPaused;
  const canStop =
    builderRunning ||
    builderPaused ||
    builderSession?.status === "awaiting_approval" ||
    agentRunning ||
    agentPaused;
  const canRetry = executionPaused;
  const canSkip = executionPaused;
  const canApprove =
    builderSession?.status === "awaiting_approval" || agentAwaiting;

  const startDisabled =
    agentStartDisabled ||
    goalInput.trim().length < 4 ||
    agentRunning;
  const idleHint =
    agentStartBlockReason ??
    (goalInput.trim().length < 4
      ? "Enter a goal with at least 4 characters."
      : null);
  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to watch the agent work."
      />
    );
  }

  const showWorkspace =
    agentSession &&
    agentSession.status !== "idle" &&
    (agentLoopSession || builderSession || agentSession.feed.length > 0);

  if (!showWorkspace) {
    return (
      <div className="agent">
        <header className="agent__head">
          <h3 className="agent__title">{BRYANTLABS_AGENT_DISPLAY_NAME}</h3>
          <p className="plan__muted">
            Reasoning-driven agent: explores the repo, plans, edits, verifies,
            and repairs — without a fixed roadmap template.
          </p>
        </header>
        <label className="builder__field">
          <span className="builder__label">Goal</span>
          <textarea
            className="builder__input"
            rows={3}
            placeholder='e.g. "Make calculator look like Apple Calculator"'
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
          />
        </label>
        {agentLoopError || idleHint ? (
          <p className="builder__error" role="alert">
            {agentLoopError ?? idleHint}
          </p>
        ) : null}
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={startDisabled}
          onClick={() => void startAgent(goalInput.trim())}
        >
          Start agent
        </button>
        <p className="plan__muted agent__hint">
          For greenfield apps and follow-up edits, use the main <strong>Agent</strong> chat.
          This view is for the autonomous reasoning loop on an open project.
        </p>
      </div>
    );
  }

  const ctx = agentSession!.context;
  const report = buildAgentReport(agentSession!);
  const agentLoop = agentLoopSession;

  return (
    <div className="agent">
      <header className="agent__head">
        <h3 className="agent__title">{BRYANTLABS_AGENT_DISPLAY_NAME} session</h3>
        <p className="agent__status">
          Status: <strong>{agentSession!.status}</strong>
          {agentLoop ? (
            <>
              {" "}
              · {BRYANTLABS_AGENT_DISPLAY_NAME}:{" "}
              <strong>{formatBryantLabsAgentStatus(agentLoop.status)}</strong>
              {agentLoop.mode === "investigation" ? " (investigation)" : ""}
            </>
          ) : null}
        </p>
      </header>

      <AgentCopyBar enabled />

      {!agentLoop && !builderSession ? (
        <section className="agent__panel agent__start-inline">
          <label className="builder__field">
            <span className="builder__label">New goal</span>
            <textarea
              className="builder__input"
              rows={2}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            disabled={startDisabled}
            onClick={() => void startAgent(goalInput.trim())}
          >
            Start agent
          </button>
        </section>
      ) : null}

      {agentLoop?.pendingApproval ? (
        <section className="agent__panel agent__approval" role="alert">
          <h4 className="agent__heading">Approval required</h4>
          <p className="agent__approval-text">{agentLoop.pendingApproval.summary}</p>
          <p className="plan__muted">
            Action: <code>{agentLoop.pendingApproval.action}</code>
          </p>
        </section>
      ) : null}

      <section className="agent__panel agent__context">
        <h4 className="agent__heading">Context</h4>
        <dl className="agent__ctx-grid">
          <div>
            <dt>Goal</dt>
            <dd>{ctx.goal ?? agentLoop?.goal ?? "—"}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{ctx.phase ?? "—"}</dd>
          </div>
          <div>
            <dt>Task</dt>
            <dd>{ctx.task ?? "—"}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>{ctx.file ? <code>{ctx.file}</code> : "—"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{ctx.model ?? "—"}</dd>
          </div>
          <div>
            <dt>Iteration</dt>
            <dd>
              {agentLoop
                ? `${agentLoop.iteration} / ${agentLoop.maxIterations}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="agent__actions">
        {canPause ? (
          <button
            type="button"
            className="prov-btn"
            onClick={() => {
              if (agentRunning) pauseAgent();
              else pauseAutonomousBuild();
            }}
          >
            Pause
          </button>
        ) : null}
        {canResume ? (
          <button
            type="button"
            className="prov-btn"
            onClick={() => {
              if (agentPaused) void resumeAgent();
              else void resumeAutonomousBuild();
            }}
          >
            Resume
          </button>
        ) : null}
        {canStop ? (
          <button
            type="button"
            className="prov-btn prov-btn--danger"
            onClick={() => {
              if (agentRunning || agentPaused) stopAgent();
              else stopAutonomousBuild();
            }}
          >
            Stop
          </button>
        ) : null}
        {canApprove ? (
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() => {
              if (agentAwaiting) void approveAgentAction();
              else void approveBuilderPhase();
            }}
          >
            Approve
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            className="prov-btn"
            onClick={() => void retryExecutionStep()}
          >
            Retry step
          </button>
        ) : null}
        {canSkip ? (
          <button
            type="button"
            className="prov-btn"
            onClick={() => void skipExecutionStep()}
          >
            Skip step
          </button>
        ) : null}
        <button type="button" className="prov-btn" onClick={clearAgentSession}>
          Clear session
        </button>
      </div>

      {agentLoop && agentLoop.dynamicTasks.length > 0 ? (
        <section className="agent__panel">
          <h4 className="agent__heading">Dynamic plan</h4>
          <ol className="agent__tasks">
            {[...agentLoop.dynamicTasks]
              .filter((t) => t.status !== "removed")
              .sort((a, b) => a.order - b.order)
              .map((t) => (
                <li
                  key={t.id}
                  className={`agent__task agent__task--${t.status}`}
                >
                  {t.title}
                  <span className="agent__task-status">{t.status}</span>
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      {reasoning.length > 0 ? (
        <section className="agent__panel">
          <h4 className="agent__heading">Reasoning (live)</h4>
          <ul className="agent__reasoning">
            {reasoning.map((r) => (
              <li key={r.id} className="agent__reason-step">
                <div className="agent__reason-row">
                  <span className="agent__reason-label">Thought</span>
                  <span>{r.thought}</span>
                </div>
                <div className="agent__reason-row">
                  <span className="agent__reason-label">Reason</span>
                  <span>{r.reason}</span>
                </div>
                <div className="agent__reason-row">
                  <span className="agent__reason-label">Action</span>
                  <code>{r.action}</code>
                </div>
                {r.result ? (
                  <div className="agent__reason-row">
                    <span className="agent__reason-label">Result</span>
                    <span
                      className={
                        r.ok ? "agent__reason-ok" : "agent__reason-fail"
                      }
                    >
                      {r.result}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="agent__panel">
        <h4 className="agent__heading">Timeline</h4>
        <ol className="agent__timeline">
          {agentSession!.timeline.map((stage, i) => (
            <li
              key={stage.id}
              className={`agent__tl-stage agent__tl-stage--${stage.status}`}
            >
              <span className="agent__tl-label">{stage.label}</span>
              {i < agentSession!.timeline.length - 1 ? (
                <span className="agent__tl-arrow" aria-hidden="true">
                  ↓
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="agent__panel">
        <h4 className="agent__heading">Live feed</h4>
        <ul className="agent__feed">
          {feed.length === 0 ? (
            <li className="plan__muted">Waiting for agent activity…</li>
          ) : (
            feed.map((entry) => (
              <li
                key={entry.id}
                className={`agent__feed-item agent__feed-item--${entry.kind}${
                  entry.active ? " agent__feed-item--active" : ""
                }`}
              >
                <span className="agent__feed-kind">
                  {FEED_LABEL[entry.kind]}…
                </span>
                <span className="agent__feed-title">{entry.title}</span>
                {entry.detail ? (
                  <span className="agent__feed-detail">{entry.detail}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      {agentSession!.decisions.length > 0 ? (
        <section className="agent__panel">
          <h4 className="agent__heading">File decisions</h4>
          <ul className="agent__decisions">
            {agentSession!.decisions.map((d) => (
              <li key={`${d.path}-${d.at}`} className="agent__decision">
                <code className="agent__decision-path">{d.path}</code>
                <span className="agent__decision-label">Reason:</span>
                <span className="agent__decision-reason">{d.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="agent__panel">
        <h4 className="agent__heading">History</h4>
        <ul className="agent__history">
          {[...agentSession!.history].reverse().map((h) => (
            <li key={h.id} className="agent__hist-item">
              <span className="agent__hist-cat">{h.category}</span>
              <span className="agent__hist-title">{h.title}</span>
              {h.detail ? (
                <span className="agent__hist-detail">{h.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="agent__panel">
        <h4 className="agent__heading">Artifacts</h4>
        <dl className="agent__artifacts">
          <div>
            <dt>Created</dt>
            <dd>
              {agentSession!.artifacts.filesCreated.length
                ? agentSession!.artifacts.filesCreated.join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Modified</dt>
            <dd>
              {agentSession!.artifacts.filesModified.length
                ? agentSession!.artifacts.filesModified.join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Errors fixed</dt>
            <dd>
              {agentSession!.artifacts.errorsFixed.length
                ? agentSession!.artifacts.errorsFixed.join("; ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>
              {agentSession!.artifacts.verificationResults.length
                ? agentSession!.artifacts.verificationResults.join("; ")
                : "—"}
            </dd>
          </div>
        </dl>
        <p className="plan__muted agent__report-hint">
          {report.plans.length} plan(s) ·{" "}
          {report.durationMs > 0
            ? `${Math.round(report.durationMs / 1000)}s elapsed`
            : "in progress"}
        </p>
      </section>
    </div>
  );
}
