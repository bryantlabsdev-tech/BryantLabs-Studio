import { useEffect, useMemo, useState } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { deriveRunConversation } from "@/core/agent/runConversation";
import { overallStatusLabel } from "@/core/agent/runOutcome";
import { runHistoryOutcomeLabel } from "@/core/agent/runHistoryOutcome";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";
import { agentRunStepIcon } from "@/core/agent/agentRunCard";
import { DiffRowsView } from "@/components/editor/DiffRowsView";
import { RunReviewActions } from "@/components/views/RunReviewActions";
import { UiAuditFailureDiagnosticsPanel } from "@/components/views/UiAuditFailureDiagnosticsPanel";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { DiagnosticReportActions } from "@/components/views/DiagnosticReportActions";
import { RunInspectorActions } from "@/components/views/RunInspectorActions";
import type { PlanApplyFileEntry } from "@/core/planApply/types";
import type { PlanApplySession } from "@/core/planApply/types";
import type { BuildLoopPhase } from "@/core/build/types";
import { AgentTimeline, AgentTimelineCard } from "@/components/agent/AgentTimelineCard";
import { AgentTimelineDiagnostics } from "@/components/agent/AgentTimelineDiagnostics";
import { AgentActivityStream } from "@/components/agent/AgentActivityStream";
import { AgentFileSelectionPreview } from "@/components/agent/AgentFileSelectionPreview";
import { AgentPlanPreviewCard } from "@/components/agent/AgentPlanPreviewCard";
import {
  AgentFailureRecovery,
  buildFailureRecoveryCopy,
} from "@/components/agent/AgentFailureRecovery";
import { copyDiagnosticReportText, resolveDiagnosticReportBundle } from "@/core/diagnostics/diagnosticReport";
import { useWorkspace } from "@/app/WorkspaceProvider";

export interface RunReviewProps {
  readonly awaiting: boolean;
  readonly planSummary?: string | undefined;
  readonly changedFiles: readonly PlanApplyFileEntry[];
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onRevision: () => void;
}

export interface RunConversationBlockProps {
  readonly viewModel: AgentRunCardViewModel;
  readonly runNumber?: number;
  readonly frozen?: boolean;
  readonly artifact?: AgentRunArtifact | null;
  readonly fileDiffs?: readonly RunFileDiff[];
  readonly selected?: boolean;
  readonly onSelect?: () => void;
  readonly review?: RunReviewProps | null;
  readonly onCancel?: () => void;
  readonly onOpenConsole?: () => void;
  readonly onRetry?: () => void;
  readonly onSwitchProvider?: () => void;
  readonly onOpenPreview?: () => void;
  readonly onOpenFile?: (path: string) => void;
  readonly onViewChanges?: () => void;
  readonly onFocusDiffFile?: (path: string) => void;
  readonly highlighted?: boolean;
  readonly greenfieldRun?: GreenfieldRunSnapshot | null;
  readonly projectPath?: string | null;
  readonly prompt?: string | null;
  readonly activeRunId?: string | null;
  readonly planApplySession?: PlanApplySession | null;
  readonly buildPhase?: BuildLoopPhase;
  readonly scanStatus?: "idle" | "scanning" | "done" | "error";
  readonly continuous?: boolean;
}

function InlineFileDiff({ file }: { readonly file: RunFileDiff }) {
  if (file.before !== undefined && file.after !== undefined) {
    return <DiffRowsView before={file.before} after={file.after} />;
  }

  if (file.preview.length === 0) {
    return (
      <p className="run-conversation__diff-stats plan__muted">
        +{file.linesAdded} / −{file.linesRemoved}
      </p>
    );
  }

  return (
    <ul className="run-conversation__diff-lines">
      {file.preview.map((line, index) => (
        <li
          key={`${line.type}-${index}`}
          className={`run-conversation__diff-line run-conversation__diff-line--${line.type}`}
        >
          <span className="run-conversation__diff-sign">
            {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
          </span>
          <span>{line.text || " "}</span>
        </li>
      ))}
    </ul>
  );
}

function verificationSummary(card: AgentRunCardViewModel): string[] {
  const lines: string[] = [];
  const v = card.verification;
  if (v.typescript !== "pending") lines.push(`TypeScript: ${v.typescript}`);
  if (v.build !== "pending") lines.push(`Build: ${v.build}`);
  if (v.uiAudit !== "pending") lines.push(`UI audit: ${v.uiAudit}`);
  if (v.preview !== "pending") lines.push(`Preview: ${v.preview}`);
  return lines;
}

export function RunConversationBlock({
  viewModel,
  runNumber,
  frozen = false,
  artifact = null,
  fileDiffs = [],
  selected = false,
  onSelect,
  review = null,
  onCancel,
  onOpenConsole,
  onRetry,
  onSwitchProvider,
  onOpenPreview,
  onOpenFile,
  onViewChanges,
  onFocusDiffFile,
  highlighted = false,
  greenfieldRun = null,
  projectPath = null,
  prompt = null,
  activeRunId = null,
  planApplySession = null,
  buildPhase = "idle",
  scanStatus = "idle",
  continuous = false,
}: RunConversationBlockProps) {
  const { openDiagnosticReport, openRunInspector } = useWorkspace();
  const [diffOpen, setDiffOpen] = useState(false);

  const openWorkbenchDiff = (path?: string) => {
    if (path && onFocusDiffFile) {
      onFocusDiffFile(path);
      return;
    }
    onViewChanges?.();
  };

  const conversation = useMemo(
    () =>
      deriveRunConversation({
        card: viewModel,
        outcome: artifact?.outcome ?? null,
      }),
    [viewModel, artifact?.outcome],
  );

  const diffs =
    fileDiffs.length > 0
      ? fileDiffs
      : artifact?.fileDiffs ?? [];

  const isRunning = conversation.isRunning && !frozen;
  const outcomeBadgeLabel = artifact?.outcome
    ? runHistoryOutcomeLabel(artifact.outcome)
    : overallStatusLabel(viewModel.overallStatus);
  const outcomeBadgeClass = isRunning
    ? "running"
    : artifact?.outcome ?? viewModel.overallStatus;
  const showReview = Boolean(review?.awaiting && !frozen);
  const resolvedGreenfieldRun =
    greenfieldRun ??
    (artifact ? greenfieldSnapshotFromArtifact(artifact) : emptyGreenfieldRun());
  const resolvedPrompt = prompt ?? artifact?.prompt ?? "";
  const showDiagnostics = Boolean(artifact?.runId ?? activeRunId);
  const runId = artifact?.runId ?? activeRunId ?? null;

  const failureCopy = buildFailureRecoveryCopy({
    card: viewModel,
    failureDetails: conversation.failureDetails,
    failureReason: conversation.failureReason,
    suggestedFix: conversation.suggestedFix,
  });

  const diagnosticBundle = useMemo(
    () =>
      runId
        ? resolveDiagnosticReportBundle({
            runId,
            previousRunId: artifact?.previousRunId ?? null,
            prompt: resolvedPrompt,
            card: viewModel,
            greenfieldRun: resolvedGreenfieldRun,
            artifact,
            outcome: artifact?.outcome ?? null,
            projectPath,
            route: artifact?.timeline?.route ?? resolvedGreenfieldRun.runTimeline?.route ?? null,
            generationMode: resolvedGreenfieldRun.actionType,
          })
        : null,
    [
      artifact,
      projectPath,
      resolvedGreenfieldRun,
      resolvedPrompt,
      runId,
      viewModel,
    ],
  );

  const handleOpenDiagnostics = () => {
    if (!runId || !diagnosticBundle) return;
    openDiagnosticReport({
      runId,
      bundle: diagnosticBundle,
      metadata: {
        runId,
        previousRunId: artifact?.previousRunId ?? null,
        prompt: resolvedPrompt,
        projectPath,
        route: artifact?.timeline?.route ?? resolvedGreenfieldRun.runTimeline?.route ?? null,
        generationMode: resolvedGreenfieldRun.actionType,
      },
    });
  };

  const runTimeline = artifact?.timeline ?? resolvedGreenfieldRun.runTimeline ?? null;
  const runStartedAt = artifact?.startedAt ?? resolvedGreenfieldRun.runStartedAt ?? null;

  const shouldExpandByDefault =
    !frozen ||
    isRunning ||
    selected ||
    highlighted ||
    showReview ||
    conversation.isFailed;

  const [expanded, setExpanded] = useState(shouldExpandByDefault);

  useEffect(() => {
    if (shouldExpandByDefault) setExpanded(true);
  }, [shouldExpandByDefault, highlighted, selected, showReview]);

  const collapsed = frozen && !expanded && !isRunning;

  const showProgressInDetails =
    frozen && !isRunning && conversation.isSuccess && !showReview;
  const showProgressOpen =
    isRunning || !frozen || showReview || conversation.isFailed;

  const showFileSelection =
    !collapsed &&
    ((planApplySession?.files.length ?? 0) > 0 ||
      viewModel.patchImpact.files.length > 0 ||
      viewModel.filesPlanned.length > 0 ||
      conversation.modifiedFiles.length > 0);

  const handleCopyReport = async () => {
    if (!diagnosticBundle) return;
    await copyDiagnosticReportText(diagnosticBundle.text);
  };

  return (
    <article
      className={[
        "run-conversation",
        "agent-run-card",
        `agent-run-card--${viewModel.overallStatus}`,
        frozen ? "agent-run-card--frozen" : "",
        continuous ? "run-conversation--continuous" : "",
        selected ? "agent-run-card--selected" : "",
        highlighted ? "run-conversation--highlighted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="run-conversation-block"
      data-run-id={artifact?.runId}
      aria-live={frozen ? "off" : "polite"}
      {...(onSelect ? { role: "button", tabIndex: 0, onClick: onSelect } : {})}
    >
      <header className="run-conversation__head run-conversation__head--minimal">
        {!continuous && runNumber != null ? (
          <span className="run-conversation__run-label">Run #{runNumber}</span>
        ) : null}
        <span
          className={`run-conversation__outcome-badge run-conversation__outcome-badge--${outcomeBadgeClass}`}
          data-testid="run-outcome-badge"
        >
          {outcomeBadgeLabel}
        </span>
        {isRunning ? (
          <span className="agent-run-card__spinner" aria-hidden data-testid="agent-run-spinner" />
        ) : null}
        {frozen && !isRunning ? (
          <button
            type="button"
            className="run-conversation__expand-btn build-view__link"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((open) => !open);
            }}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        ) : null}
      </header>

      {collapsed ? (
        <button
          type="button"
          className="run-collapsed-summary"
          data-testid="run-collapsed-summary"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(true);
          }}
        >
          <span className="run-collapsed-summary__prompt">
            {resolvedPrompt.slice(0, 120)}
            {resolvedPrompt.length > 120 ? "…" : ""}
          </span>
          <span className="run-collapsed-summary__meta plan__muted">
            {conversation.filesCount > 0 ? `${conversation.filesCount} files · ` : ""}
            {formatGreenfieldElapsed(conversation.durationMs)}
          </span>
        </button>
      ) : (
      <div className="run-conversation__body">
        <AgentTimeline>
          {resolvedPrompt && !continuous ? (
            <AgentTimelineCard icon="💬" title="Your request" testId="timeline-user-prompt">
              <p>{resolvedPrompt}</p>
            </AgentTimelineCard>
          ) : null}

          {(() => {
            const progressCards = (
              <>
          {(isRunning || !frozen) ? (
            <AgentTimelineCard
              icon="📋"
              title="Plan & activity"
              tone={isRunning ? "running" : "default"}
              testId="timeline-plan-activity"
            >
              <AgentPlanPreviewCard
                card={viewModel}
                buildPhase={buildPhase}
                planApplySession={planApplySession}
                scanStatus={scanStatus}
                timeline={runTimeline}
                runStartedAt={runStartedAt}
              />
              <AgentActivityStream
                card={viewModel}
                buildPhase={buildPhase}
                planApplySession={planApplySession}
                scanStatus={scanStatus}
                timeline={runTimeline}
                runStartedAt={runStartedAt}
                compact={frozen && !isRunning}
              />
            </AgentTimelineCard>
          ) : null}

          {showFileSelection ? (
            <AgentTimelineCard
              icon="📁"
              title="File selection"
              meta={
                planApplySession?.files.length
                  ? `${planApplySession.files.length} selected`
                  : `${conversation.modifiedFiles.length || viewModel.patchImpact.files.length} files`
              }
              tone={isRunning && viewModel.currentStep?.id === "editing" ? "running" : "default"}
              testId="timeline-file-selection"
            >
              <AgentFileSelectionPreview
                card={viewModel}
                planApplySession={planApplySession}
                {...(onOpenFile ? { onOpenFile } : {})}
              />
            </AgentTimelineCard>
          ) : null}

          {(diffs.length > 0 || showReview) ? (
            <AgentTimelineCard
              icon="✏️"
              title="Code changes"
              meta={showReview ? "Awaiting review" : `${diffs.length} files`}
              tone={showReview ? "running" : "default"}
              testId="timeline-code-changes"
            >
              {showReview && review ? (
                <RunReviewActions review={review} />
              ) : (
                <>
                  <button
                    type="button"
                    className="run-conversation__section-toggle"
                    aria-expanded={diffOpen}
                    onClick={() => {
                      setDiffOpen((open) => {
                        const next = !open;
                        if (next) openWorkbenchDiff(diffs[0]?.path);
                        return next;
                      });
                    }}
                  >
                    {diffOpen ? "Hide changes" : "View changes"}
                  </button>
                  {diffOpen ? (
                    <div className="run-conversation__diff-panel" data-testid="run-inline-diff">
                      {diffs.map((file) => (
                        <div key={file.path} className="run-conversation__diff-file">
                          <p className="run-conversation__diff-path">{file.path}</p>
                          <InlineFileDiff file={file} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </AgentTimelineCard>
          ) : null}

          {(verificationSummary(viewModel).length > 0 || isRunning) ? (
            <AgentTimelineCard
              icon="✅"
              title="Verification"
              tone={
                viewModel.verification.build === "failed" ||
                viewModel.verification.typescript === "failed"
                  ? "failed"
                  : viewModel.verification.build === "passed"
                    ? "success"
                    : isRunning
                      ? "running"
                      : "default"
              }
              testId="timeline-verification"
            >
              {verificationSummary(viewModel).length > 0 ? (
                <ul className="agent-timeline-card__list">
                  {verificationSummary(viewModel).map((line) => (
                    <li key={line} className="agent-timeline-card__list-item">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="plan__muted">
                  {viewModel.currentStep?.label ?? "Running checks…"}
                </p>
              )}
            </AgentTimelineCard>
          ) : null}
              </>
            );

            if (showProgressInDetails) {
              return (
                <details className="run-advanced-details run-advanced-details--progress">
                  <summary>Run details</summary>
                  {progressCards}
                </details>
              );
            }
            if (showProgressOpen) return progressCards;
            return null;
          })()}

          {conversation.isFailed && !isRunning ? (
            <AgentTimelineCard
              icon="⚠️"
              title="Failure & recovery"
              tone="failed"
              testId="timeline-failure"
            >
              <AgentFailureRecovery
                headline={failureCopy.headline}
                whatHappened={failureCopy.whatHappened}
                whyLikely={failureCopy.whyLikely}
                recommendedAction={failureCopy.recommendedAction}
                failureDetails={conversation.failureDetails}
                {...(onRetry ? { onRetry } : {})}
                {...(onSwitchProvider
                  ? {
                      onRetryStronger: onSwitchProvider,
                      strongerModelLabel: "Retry with stronger model",
                    }
                  : {})}
                {...(diagnosticBundle ? { onOpenDiagnostics: handleOpenDiagnostics } : {})}
                {...(runId ? { onInspectRun: () => openRunInspector(runId) } : {})}
                {...(diagnosticBundle ? { onCopyReport: handleCopyReport } : {})}
              />
              {viewModel.diagnostics.items[0]?.uiAudit ? (
                <UiAuditFailureDiagnosticsPanel
                  diagnostics={viewModel.diagnostics.items[0].uiAudit}
                />
              ) : null}
            </AgentTimelineCard>
          ) : null}

          {conversation.isSuccess && !showReview ? (
            <AgentTimelineCard
              icon="🎉"
              title="Result"
              meta={formatGreenfieldElapsed(conversation.durationMs)}
              tone="success"
              testId="timeline-result"
            >
              <p>
                {conversation.filesCount} file{conversation.filesCount === 1 ? "" : "s"} modified
                {conversation.previewReady ? " · Preview ready" : ""}
              </p>
              <div className="run-conversation__card-actions">
                {conversation.previewReady && onOpenPreview ? (
                  <button type="button" className="prov-btn" onClick={onOpenPreview}>
                    Open preview
                  </button>
                ) : null}
                {onViewChanges || onFocusDiffFile ? (
                  <button
                    type="button"
                    className="build-view__link"
                    onClick={() => openWorkbenchDiff(diffs[0]?.path)}
                  >
                    View changes
                  </button>
                ) : null}
              </div>
            </AgentTimelineCard>
          ) : null}

          {conversation.isNeutral && !isRunning ? (
            <AgentTimelineCard icon="ℹ️" title="Run status" testId="timeline-neutral">
              <p className="run-conversation__cancelled" data-testid="run-neutral-status">
                {viewModel.summary ?? outcomeBadgeLabel}
              </p>
            </AgentTimelineCard>
          ) : null}
        </AgentTimeline>

        {isRunning ? (
          <p className="run-conversation__status-line">
            <span className="agent-run-card__status-icon" aria-hidden>
              {agentRunStepIcon(viewModel.currentStep?.status ?? "running")}
            </span>
            <span>{viewModel.currentStep?.label ?? "Working…"}</span>
          </p>
        ) : null}

        {isRunning && viewModel.stuckMessage ? (
          <p className="run-conversation__stuck plan__muted" role="status">
            {viewModel.stuckMessage}
          </p>
        ) : null}

        {showDiagnostics && !collapsed ? (
          <details className="run-advanced-details">
            <summary>Diagnostics & inspector</summary>
            <AgentTimelineDiagnostics card={viewModel} artifact={artifact} />
            <div className="run-conversation__inspect-actions">
              <DiagnosticReportActions
                runId={runId}
                previousRunId={artifact?.previousRunId ?? null}
                prompt={resolvedPrompt}
                card={viewModel}
                greenfieldRun={resolvedGreenfieldRun}
                artifact={artifact}
                outcome={artifact?.outcome ?? null}
                projectPath={projectPath}
                route={artifact?.timeline?.route ?? resolvedGreenfieldRun.runTimeline?.route ?? null}
                generationMode={resolvedGreenfieldRun.actionType}
              />
              <RunInspectorActions runId={runId} />
            </div>
          </details>
        ) : null}
      </div>
      )}

      {!collapsed ? (
      <footer className="run-conversation__footer run-conversation__footer--minimal">
        <div className="agent-run-card__actions">
          {isRunning && onCancel ? (
            <button type="button" className="prov-btn" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          {onOpenConsole ? (
            <button type="button" className="build-view__link" onClick={onOpenConsole}>
              Console
            </button>
          ) : null}
          {viewModel.showRecoveryActions && !frozen && onRetry ? (
            <button type="button" className="build-view__link" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          {viewModel.showRecoveryActions && !frozen && onSwitchProvider ? (
            <button type="button" className="build-view__link" onClick={onSwitchProvider}>
              Switch provider
            </button>
          ) : null}
        </div>
      </footer>
      ) : null}
    </article>
  );
}
