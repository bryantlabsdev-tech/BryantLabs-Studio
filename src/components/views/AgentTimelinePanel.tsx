import {
  buildAgentTimelineEvents,
  deriveAgentRunLifecyclePhase,
  lifecyclePhaseLabel,
  type AgentRunLifecyclePhase,
} from "@/core/agent/agentRunLifecycle";
import type { BuildLoopPhase } from "@/core/build/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

interface AgentTimelinePanelProps {
  readonly submissionAt: number | null;
  readonly submissionPromptLength: number | null;
  readonly submissionPending: boolean;
  readonly activeRunId: string | null;
  readonly projectPath: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly buildRunning: boolean;
  readonly buildPhase: BuildLoopPhase;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly buildError: string | null;
  readonly planApplyError: string | null;
  readonly pipelineError: string | null;
  readonly stallMessage: string | null;
  readonly onResetAgentState?: () => void;
  readonly onCancelRun?: () => void;
}

function phaseClass(phase: AgentRunLifecyclePhase): string {
  if (phase === "failed") return "agent-timeline__phase--failed";
  if (phase === "finished") return "agent-timeline__phase--finished";
  if (phase === "idle") return "agent-timeline__phase--idle";
  return "agent-timeline__phase--active";
}

export function AgentTimelinePanel({
  submissionAt,
  submissionPromptLength,
  submissionPending,
  activeRunId,
  projectPath,
  greenfieldRun,
  buildRunning,
  buildPhase,
  scanStatus,
  buildError,
  planApplyError,
  pipelineError,
  stallMessage,
  onResetAgentState,
  onCancelRun,
}: AgentTimelinePanelProps) {
  const phase = deriveAgentRunLifecyclePhase({
    submissionPending,
    greenfieldRun,
    greenfieldPanelActive: submissionPending || greenfieldRun.actionType === "greenfield",
    buildRunning,
    buildPhase,
    scanStatus,
  });

  const events = buildAgentTimelineEvents({
    submissionAt,
    submissionPromptLength,
    activeRunId,
    projectPath,
    greenfieldRun,
    timeline: greenfieldRun.runTimeline,
    buildError,
    planApplyError,
    pipelineError,
  });

  const showPanel =
    phase !== "idle" ||
    events.length > 0 ||
    Boolean(stallMessage) ||
    Boolean(buildError || planApplyError || pipelineError);

  if (!showPanel) return null;

  return (
    <section
      className="agent-timeline"
      aria-label="Agent timeline"
      data-testid="agent-timeline"
    >
      <header className="agent-timeline__head">
        <div>
          <p className="agent-timeline__eyebrow plan__muted">Agent status</p>
          <p className={`agent-timeline__phase ${phaseClass(phase)}`}>
            {lifecyclePhaseLabel(phase)}
          </p>
        </div>
        <div className="agent-timeline__actions">
          {onCancelRun && phase !== "idle" && phase !== "finished" ? (
            <button type="button" className="build-view__link" onClick={onCancelRun}>
              Cancel run
            </button>
          ) : null}
          {onResetAgentState ? (
            <button type="button" className="build-view__link" onClick={onResetAgentState}>
              Reset agent state
            </button>
          ) : null}
        </div>
      </header>

      {stallMessage ? (
        <p className="agent-timeline__stall" role="alert">
          {stallMessage}
        </p>
      ) : null}

      <ol className="agent-timeline__list">
        {events.slice(-12).map((event) => (
          <li
            key={event.id}
            className={`agent-timeline__item agent-timeline__item--${event.tone}`}
          >
            <span className="agent-timeline__item-label">{event.label}</span>
            {event.detail ? (
              <span className="agent-timeline__item-detail plan__muted">{event.detail}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
