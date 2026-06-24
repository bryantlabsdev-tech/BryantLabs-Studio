import { AgentStatusHeader } from "@/components/agent/AgentStatusHeader";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { BuildLoopPhase } from "@/core/build/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

interface RunTimelineVisualizationProps {
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

/** Sticky active-run status header (Cursor-style agent workspace). */
export function RunTimelineVisualization(props: RunTimelineVisualizationProps) {
  return <AgentStatusHeader {...props} />;
}
