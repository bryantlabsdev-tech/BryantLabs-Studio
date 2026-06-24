import {
  deriveAgentRunLifecyclePhase,
  lifecyclePhaseLabel,
  type AgentRunLifecyclePhase,
} from "@/core/agent/agentRunLifecycle";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { BuildLoopPhase } from "@/core/build/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";

interface AgentStatusHeaderProps {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly buildRunning: boolean;
  readonly buildPhase: BuildLoopPhase;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly submissionPending: boolean;
  readonly stallMessage: string | null;
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly agentRunCard?: AgentRunCardViewModel | null;
  readonly onResetAgentState?: () => void;
  readonly onCancelRun?: () => void;
}

function phaseClass(phase: AgentRunLifecyclePhase): string {
  if (phase === "failed") return "agent-status-header__chip--failed";
  if (phase === "finished") return "agent-status-header__chip--success";
  return "";
}

function buildStatusLabel(card: AgentRunCardViewModel | null | undefined): string | null {
  if (!card) return null;
  const v = card.verification;
  if (v.build === "passed") return "Build passed";
  if (v.build === "failed") return "Build failed";
  if (v.typescript === "failed") return "TypeScript failed";
  if (card.overallStatus === "running") return "In progress";
  return null;
}

/** Compact sticky header — only visible during active runs or when errors need attention. */
export function AgentStatusHeader({
  greenfieldRun,
  buildRunning,
  buildPhase,
  scanStatus,
  submissionPending,
  stallMessage,
  buildError,
  planApplyError,
  pipelineError,
  agentRunCard = null,
  onResetAgentState,
  onCancelRun,
}: AgentStatusHeaderProps) {
  const phase = deriveAgentRunLifecyclePhase({
    submissionPending,
    greenfieldRun,
    greenfieldPanelActive: submissionPending || greenfieldRun.actionType === "greenfield",
    buildRunning,
    buildPhase,
    scanStatus,
  });

  const isActive = phase !== "idle" && phase !== "finished" && phase !== "failed";
  const hasIssue = Boolean(
    stallMessage || buildError || planApplyError || pipelineError,
  );

  if (!isActive && !hasIssue) return null;

  const elapsedMs =
    agentRunCard?.durationMs ??
    (greenfieldRun.runStartedAt ? Date.now() - greenfieldRun.runStartedAt : 0);

  const buildLabel = buildStatusLabel(agentRunCard);

  return (
    <header
      className="agent-status-header agent-status-header--compact"
      aria-label="Active agent run"
      data-testid="agent-status-header"
    >
      <div className="agent-status-header__row">
        <div className={`agent-status-header__stage ${phaseClass(phase)}`}>
          {isActive ? <span className="agent-status-header__pulse" aria-hidden /> : null}
          <span>{lifecyclePhaseLabel(phase)}</span>
          {isActive && agentRunCard?.currentStep?.label ? (
            <span className="plan__muted">· {agentRunCard.currentStep.label}</span>
          ) : null}
        </div>

        {isActive && elapsedMs > 0 ? (
          <span className="agent-status-header__chip">
            {formatGreenfieldElapsed(elapsedMs)}
          </span>
        ) : null}

        {isActive && buildLabel ? (
          <span
            className={[
              "agent-status-header__chip",
              buildLabel.includes("passed")
                ? "agent-status-header__chip--success"
                : buildLabel.includes("failed")
                  ? "agent-status-header__chip--failed"
                  : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {buildLabel}
          </span>
        ) : null}

        <div className="agent-status-header__actions">
          {onCancelRun && isActive ? (
            <button type="button" className="prov-btn" onClick={onCancelRun}>
              Cancel
            </button>
          ) : null}
          {hasIssue && onResetAgentState ? (
            <button type="button" className="build-view__link" onClick={onResetAgentState}>
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {stallMessage ? (
        <p className="run-timeline-viz__stall" role="alert">
          {stallMessage}
        </p>
      ) : null}

      {hasIssue && (buildError || planApplyError || pipelineError) ? (
        <p className="run-timeline-viz__stall" role="alert">
          {buildError ?? planApplyError ?? pipelineError}
        </p>
      ) : null}
    </header>
  );
}
