import { useMemo } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { deriveRunConversation } from "@/core/agent/runConversation";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import type { PlanApplySession } from "@/core/planApply/types";
import type { BuildLoopPhase } from "@/core/build/types";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import { AgentExecutionFlow } from "@/components/agent/AgentExecutionFlow";
import { buildAgentRunFinalSummary } from "@/core/agent/agentLiveActivityTimeline";
import { resolveDiagnosticReportBundle } from "@/core/diagnostics/diagnosticReport";
import { useWorkspace } from "@/app/WorkspaceProvider";

export interface RunReviewProps {
  readonly awaiting: boolean;
  readonly planSummary?: string | undefined;
  readonly changedFiles: readonly import("@/core/planApply/types").PlanApplyFileEntry[];
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onRevision: () => void;
  readonly onPartialContentChange?: (relPath: string, mergedAfter: string) => void;
  readonly onAcceptFile?: (relPath: string) => void;
  readonly onRejectFile?: (relPath: string) => void;
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

export function RunConversationBlock({
  viewModel,
  frozen = false,
  artifact = null,
  fileDiffs = [],
  selected = false,
  onSelect,
  review = null,
  onCancel,
  onRetry,
  onOpenPreview,
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
  const { openRunInspector, openDiagnosticReport } = useWorkspace();

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
  const showReview = Boolean(review?.awaiting && !frozen);
  const resolvedGreenfieldRun =
    greenfieldRun ??
    (artifact ? greenfieldSnapshotFromArtifact(artifact) : emptyGreenfieldRun());
  const runId = artifact?.runId ?? activeRunId ?? null;
  const resolvedPrompt = prompt ?? artifact?.prompt ?? "";

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
            projectPath: projectPath ?? null,
            route: artifact?.timeline?.route ?? resolvedGreenfieldRun.runTimeline?.route ?? null,
            generationMode: resolvedGreenfieldRun.actionType,
          })
        : null,
    [artifact, projectPath, resolvedGreenfieldRun, resolvedPrompt, runId, viewModel],
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
        projectPath: projectPath ?? null,
        route: artifact?.timeline?.route ?? resolvedGreenfieldRun.runTimeline?.route ?? null,
        generationMode: resolvedGreenfieldRun.actionType,
      },
    });
  };

  const runTimeline = artifact?.timeline ?? resolvedGreenfieldRun.runTimeline ?? null;
  const runStartedAt = artifact?.startedAt ?? resolvedGreenfieldRun.runStartedAt ?? null;

  const runFinalSummary = useMemo(() => {
    if (isRunning) return null;
    if (
      viewModel.overallStatus !== "complete" &&
      viewModel.overallStatus !== "failed" &&
      viewModel.overallStatus !== "cancelled" &&
      viewModel.overallStatus !== "incomplete"
    ) {
      return null;
    }
    return buildAgentRunFinalSummary({
      entries: resolvedGreenfieldRun.entries,
      card: viewModel,
      run: resolvedGreenfieldRun,
    });
  }, [isRunning, resolvedGreenfieldRun, viewModel]);

  const openWorkbenchDiff = (path?: string) => {
    if (path && onFocusDiffFile) {
      onFocusDiffFile(path);
      return;
    }
    onViewChanges?.();
  };

  const openReviewWorkbench = () => {
    const firstReviewFile = review?.changedFiles[0]?.relPath;
    if (firstReviewFile) {
      openWorkbenchDiff(firstReviewFile);
      return;
    }
    openWorkbenchDiff(diffs[0]?.path);
  };

  const wrapperClassName = [
    continuous ? "agent-turn__content" : "run-conversation",
    frozen ? "agent-turn__content--frozen" : "",
    selected ? "agent-run-card--selected" : "",
    highlighted ? "run-conversation--highlighted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const flow = (
    <AgentExecutionFlow
      card={viewModel}
      buildPhase={buildPhase}
      planApplySession={planApplySession}
      scanStatus={scanStatus}
      timeline={runTimeline}
      runStartedAt={runStartedAt}
      greenfieldRun={resolvedGreenfieldRun}
      frozen={frozen}
      embedded={continuous}
      review={showReview ? review : null}
      runFinalSummary={runFinalSummary}
      previewReady={conversation.previewReady}
      runId={runId}
      {...(isRunning && onCancel ? { onCancel } : {})}
      {...(onOpenPreview ? { onOpenPreview } : {})}
      {...(onViewChanges || onFocusDiffFile
        ? { onViewChanges: () => openWorkbenchDiff(diffs[0]?.path) }
        : {})}
      {...(showReview && (onFocusDiffFile || onViewChanges)
        ? { onOpenReview: openReviewWorkbench }
        : {})}
      {...(runId && diagnosticBundle ? { onOpenDiagnostics: handleOpenDiagnostics } : {})}
      {...(runId ? { onOpenDetails: () => openRunInspector(runId) } : {})}
      {...(onRetry ? { onRetry } : {})}
    />
  );

  if (continuous) {
    return (
      <div
        className={wrapperClassName}
        data-testid="run-conversation-block"
        data-run-id={artifact?.runId}
        aria-live={frozen ? "off" : "polite"}
        {...(onSelect ? { role: "button", tabIndex: 0, onClick: onSelect } : {})}
      >
        {flow}
      </div>
    );
  }

  return (
    <article
      className={wrapperClassName}
      data-testid="run-conversation-block"
      data-run-id={artifact?.runId}
      aria-live={frozen ? "off" : "polite"}
      {...(onSelect ? { role: "button", tabIndex: 0, onClick: onSelect } : {})}
    >
      {flow}
    </article>
  );
}
