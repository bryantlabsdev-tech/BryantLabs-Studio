import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type { BuilderSession } from "@/core/builder";
import type { BuildLoopMode } from "@/core/build";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { ExecutionSession } from "@/core/execution";
import type { PlanApplySession } from "@/core/planApply";
import type { PipelineSession } from "@/core/pipeline/types";

export type PersistedRunKind =
  | "builder"
  | "studio_agent"
  | "execution"
  | "pipeline"
  | "build_review";

export interface PersistedRunCheckpoint {
  readonly version: 1;
  readonly projectPath: string;
  readonly savedAt: number;
  readonly kind: PersistedRunKind;
  readonly label: string;
  readonly statusNote: string;
  readonly interruptedWhileRunning: boolean;
  readonly builderSession?: BuilderSession;
  readonly agentLoopSession?: AgentLoopSession;
  readonly executionSession?: ExecutionSession;
  readonly pipelineSession?: PipelineSession;
  readonly planApplySession?: PlanApplySession;
  readonly aiPlan?: AIPlanResult | null;
  readonly plan?: Plan | null;
  readonly agentSession?: AgentWorkspaceSession | null;
  readonly lastPlanPrompt?: string | null;
  readonly buildMode?: BuildLoopMode;
}

export interface RunCheckpointInput {
  readonly projectPath: string;
  readonly builderSession: BuilderSession | null;
  readonly agentLoopSession: AgentLoopSession | null;
  readonly executionSession: ExecutionSession | null;
  readonly pipelineSession: PipelineSession | null;
  readonly planApplySession: PlanApplySession | null;
  readonly aiPlan: AIPlanResult | null;
  readonly plan: Plan | null;
  readonly agentSession: AgentWorkspaceSession | null;
  readonly lastPlanPrompt: string | null;
  readonly buildMode: BuildLoopMode;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
}
