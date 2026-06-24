import { useEffect, useRef, useState } from "react";
import {
  formatExecutionVerificationLabel,
  type ExecutionDashboardFileStatus,
  type ExecutionDashboardThought,
  type ExecutionDashboardViewModel,
} from "@/core/agent/executionDashboard";
import {
  isScrollNearBottom,
  shouldAutoScrollAgentChat,
} from "@/core/agent/agentChatAutoScroll";
import { EmptyState } from "@/components/EmptyState";
import { ExecutionIcon } from "@/components/icons";
import { UiAuditAdvisoryVerificationRow } from "@/components/views/UiAuditAdvisoryVerificationRow";

const THOUGHT_KIND_LABEL: Record<ExecutionDashboardThought["kind"], string> = {
  discovery: "Discovery",
  decision: "Decision",
  reasoning: "Reasoning",
  event: "Event",
};

const FILE_STATUS_LABEL: Record<ExecutionDashboardFileStatus, string> = {
  editing: "Editing",
  saved: "Saved",
  verified: "Verified",
};

function ProgressBar({
  percent,
  label,
  isRunning,
}: {
  readonly percent: number;
  readonly label: string;
  readonly isRunning: boolean;
}) {
  return (
    <div className="exec-dash__progress" data-testid="exec-dash-progress">
      <div className="exec-dash__progress-head">
        <span className="exec-dash__progress-label">{label}</span>
        <span className="exec-dash__progress-percent">{percent}%</span>
      </div>
      <div
        className="exec-dash__progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span
          className={`exec-dash__progress-fill${isRunning ? " exec-dash__progress-fill--active" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ThoughtItem({ thought }: { readonly thought: ExecutionDashboardThought }) {
  return (
    <li className={`exec-dash__thought exec-dash__thought--${thought.kind}`}>
      <span className="exec-dash__thought-kind">{THOUGHT_KIND_LABEL[thought.kind]}</span>
      <span className="exec-dash__thought-text">{thought.text}</span>
    </li>
  );
}

function FileRow({
  path,
  status,
}: {
  readonly path: string;
  readonly status: ExecutionDashboardFileStatus;
}) {
  return (
    <li className={`exec-dash__file exec-dash__file--${status}`} data-testid="exec-dash-file">
      <span className="exec-dash__file-path">{path}</span>
      <span className="exec-dash__file-status">{FILE_STATUS_LABEL[status]}</span>
    </li>
  );
}

export interface ExecutionDashboardProps {
  readonly viewModel: ExecutionDashboardViewModel;
  readonly onFixUiAuditAdvisory?: () => void;
  readonly runActive?: boolean;
  readonly fixRunning?: boolean;
}

export function ExecutionDashboard({
  viewModel,
  onFixUiAuditAdvisory,
  runActive = false,
  fixRunning = false,
}: ExecutionDashboardProps) {
  const thoughtsRef = useRef<HTMLDivElement>(null);
  const [userPausedAutoScroll, setUserPausedAutoScroll] = useState(false);
  const isRunning = viewModel.overallStatus === "running";

  useEffect(() => {
    setUserPausedAutoScroll(false);
  }, [viewModel.streamRevision]);

  useEffect(() => {
    const el = thoughtsRef.current;
    if (!el) return;
    if (
      !shouldAutoScrollAgentChat({
        runActive: isRunning,
        userPausedAutoScroll,
      })
    ) {
      return;
    }
    if (!isScrollNearBottom(el)) return;
    el.scrollTop = el.scrollHeight;
  }, [viewModel.streamRevision, viewModel.thoughts.length, isRunning, userPausedAutoScroll]);

  if (!viewModel.isVisible) {
    return (
      <div className="exec-dash exec-dash--idle" data-testid="execution-dashboard">
        <EmptyState
          title="No active run"
          description="Start a prompt in the Agent panel to watch execution live."
          icon={<ExecutionIcon />}
        />
      </div>
    );
  }

  return (
    <div
      className={`exec-dash exec-dash--${viewModel.overallStatus}`}
      data-testid="execution-dashboard"
      data-stream-revision={viewModel.streamRevision}
    >
      <header className="exec-dash__header">
        <div className="exec-dash__header-main">
          <h2 className="exec-dash__title">{viewModel.promptTitle}</h2>
          {viewModel.providerModel ? (
            <p className="exec-dash__provider">{viewModel.providerModel}</p>
          ) : null}
        </div>
        <span className="exec-dash__elapsed" data-testid="exec-dash-elapsed">
          {viewModel.elapsedLabel}
        </span>
      </header>

      <ProgressBar
        percent={viewModel.progressPercent}
        label={viewModel.progressLabel}
        isRunning={isRunning}
      />

      <div className="exec-dash__grid">
        <section className="exec-dash__panel exec-dash__panel--thoughts">
          <h3 className="exec-dash__panel-title">Agent Thoughts</h3>
          {viewModel.currentTask ? (
            <p className="exec-dash__current-task" data-testid="exec-dash-current-task">
              <span className="exec-dash__current-task-label">Current task</span>
              {viewModel.currentTask}
            </p>
          ) : null}
          <div
            ref={thoughtsRef}
            className="exec-dash__thoughts-scroll"
            onScroll={() => {
              const el = thoughtsRef.current;
              if (!el) return;
              setUserPausedAutoScroll(!isScrollNearBottom(el));
            }}
          >
            {viewModel.thoughts.length > 0 ? (
              <ul className="exec-dash__thoughts" data-testid="exec-dash-thoughts">
                {viewModel.thoughts.map((thought) => (
                  <ThoughtItem key={`${thought.kind}-${thought.text}`} thought={thought} />
                ))}
              </ul>
            ) : (
              <p className="exec-dash__panel-empty">Waiting for planner output…</p>
            )}
          </div>
        </section>

        <section className="exec-dash__panel exec-dash__panel--activity">
          <h3 className="exec-dash__panel-title">Current Activity</h3>
          <dl className="exec-dash__kv">
            <div className="exec-dash__kv-row">
              <dt>Pipeline stage</dt>
              <dd>{viewModel.currentStage ?? "—"}</dd>
            </div>
            <div className="exec-dash__kv-row">
              <dt>Step</dt>
              <dd>{viewModel.currentStepLabel ?? "—"}</dd>
            </div>
            <div className="exec-dash__kv-row">
              <dt>File</dt>
              <dd className="exec-dash__mono">{viewModel.currentFile ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="exec-dash__panel exec-dash__panel--files">
          <h3 className="exec-dash__panel-title">Files Being Modified</h3>
          {viewModel.files.length > 0 ? (
            <ul className="exec-dash__files" data-testid="exec-dash-files">
              {viewModel.files.map((file) => (
                <FileRow key={file.path} path={file.path} status={file.status} />
              ))}
            </ul>
          ) : (
            <p className="exec-dash__panel-empty">No files targeted yet.</p>
          )}
        </section>

        <section className="exec-dash__panel exec-dash__panel--verification">
          <h3 className="exec-dash__panel-title">Verification Status</h3>
          <ul className="exec-dash__verification" data-testid="exec-dash-verification">
            {viewModel.verification.map((row) => {
              if (row.status === "advisory" && row.label === "UI Audit" && viewModel.uiAuditAdvisory) {
                return (
                  <UiAuditAdvisoryVerificationRow
                    key={row.label}
                    advisory={viewModel.uiAuditAdvisory}
                    label={row.label}
                    {...(onFixUiAuditAdvisory
                      ? { onFixWithAi: onFixUiAuditAdvisory }
                      : {})}
                    runActive={runActive}
                    fixRunning={fixRunning}
                  />
                );
              }

              return (
                <li
                  key={row.label}
                  className={`exec-dash__verification-row exec-dash__verification-row--${row.status}`}
                >
                  {formatExecutionVerificationLabel(row.label, row.status)}
                </li>
              );
            })}
          </ul>
          {viewModel.uiAuditFailure ? (
            <div className="exec-dash__ui-audit-failure" data-testid="exec-dash-ui-audit-failure">
              <p className="exec-dash__ui-audit-title">{viewModel.uiAuditFailure.title}</p>
              <p>
                <span className="exec-dash__ui-audit-label">Reason:</span>{" "}
                {viewModel.uiAuditFailure.reason}
              </p>
              <p>
                <span className="exec-dash__ui-audit-label">Suggested fix:</span>{" "}
                {viewModel.uiAuditFailure.suggestedFix}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {viewModel.completion.isVisible ? (
        <section className="exec-dash__completion" data-testid="exec-dash-completion">
          <h3 className="exec-dash__panel-title">Completion Summary</h3>
          <dl className="exec-dash__kv exec-dash__kv--completion">
            <div className="exec-dash__kv-row">
              <dt>Files modified</dt>
              <dd>
                {viewModel.completion.filesModified.length > 0
                  ? viewModel.completion.filesModified.join(", ")
                  : "None"}
              </dd>
            </div>
            {viewModel.completion.buildResult ? (
              <div className="exec-dash__kv-row">
                <dt>Build</dt>
                <dd>{viewModel.completion.buildResult}</dd>
              </div>
            ) : null}
            {viewModel.completion.verificationResult ? (
              <div className="exec-dash__kv-row">
                <dt>Verification</dt>
                <dd>{viewModel.completion.verificationResult}</dd>
              </div>
            ) : null}
            <div className="exec-dash__kv-row">
              <dt>Duration</dt>
              <dd>{viewModel.completion.durationLabel}</dd>
            </div>
          </dl>
          {viewModel.completion.summaryLine ? (
            <p className="exec-dash__summary-line">{viewModel.completion.summaryLine}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
