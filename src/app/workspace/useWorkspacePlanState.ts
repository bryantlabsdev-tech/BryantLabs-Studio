import { useRef, useState } from "react";
import type { ApplyPlanSuccessOutcome } from "@/core/orchestration/applyPlanSuccess";
import type { AutoFixSession } from "@/core/autoFix";
import type { BuilderSession } from "@/core/builder";
import type { ExecutionSession } from "@/core/execution";
import type { Plan } from "@/core/planner";
import type {
  AIPlanResult,
  AIPatchApplyStatus,
  AIPatchSession,
} from "@/core/planner/aiTypes";
import type { PlanApplySession } from "@/core/planApply";
import type { ReferencedFileContent } from "@/core/context/referencedFileContext";
import type { PipelineCoderResult } from "@/app/orchestration";
import type { AIPatchStatus } from "@/app/orchestration";

export type AIPlanStatus = "idle" | "running" | "done" | "error";

export interface WorkspacePlanState {
  readonly plan: Plan | null;
  readonly setPlan: React.Dispatch<React.SetStateAction<Plan | null>>;
  readonly planRef: React.MutableRefObject<Plan | null>;
  readonly aiPlan: AIPlanResult | null;
  readonly setAiPlan: React.Dispatch<React.SetStateAction<AIPlanResult | null>>;
  readonly aiPlanRef: React.MutableRefObject<AIPlanResult | null>;
  readonly aiPlanStatus: AIPlanStatus;
  readonly setAiPlanStatus: React.Dispatch<React.SetStateAction<AIPlanStatus>>;
  readonly lastPlanPrompt: string | null;
  readonly setLastPlanPrompt: React.Dispatch<React.SetStateAction<string | null>>;
  readonly planApplySession: PlanApplySession | null;
  readonly setPlanApplySession: React.Dispatch<
    React.SetStateAction<PlanApplySession | null>
  >;
  readonly planApplyError: string | null;
  readonly setPlanApplyError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly executionSession: ExecutionSession | null;
  readonly setExecutionSession: React.Dispatch<
    React.SetStateAction<ExecutionSession | null>
  >;
  readonly executionError: string | null;
  readonly setExecutionError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly builderSession: BuilderSession | null;
  readonly setBuilderSession: React.Dispatch<
    React.SetStateAction<BuilderSession | null>
  >;
  readonly builderError: string | null;
  readonly setBuilderError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly builderControlRef: React.MutableRefObject<{
    paused: boolean;
    stopped: boolean;
  }>;
  readonly builderSkipApprovalRef: React.MutableRefObject<string | null>;
  readonly autoFixSession: AutoFixSession | null;
  readonly setAutoFixSession: React.Dispatch<
    React.SetStateAction<AutoFixSession | null>
  >;
  readonly aiPatchSession: AIPatchSession | null;
  readonly setAiPatchSession: React.Dispatch<
    React.SetStateAction<AIPatchSession | null>
  >;
  readonly patchStatus: AIPatchStatus;
  readonly setPatchStatus: React.Dispatch<React.SetStateAction<AIPatchStatus>>;
  readonly patchError: string | null;
  readonly setPatchError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly aiPatchApproved: boolean;
  readonly setAiPatchApproved: React.Dispatch<React.SetStateAction<boolean>>;
  readonly aiPatchApplyStatus: AIPatchApplyStatus;
  readonly setAiPatchApplyStatus: React.Dispatch<
    React.SetStateAction<AIPatchApplyStatus>
  >;
  readonly aiPatchApplyError: string | null;
  readonly setAiPatchApplyError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly applyPlanSuccessRef: React.MutableRefObject<ApplyPlanSuccessOutcome | null>;
  readonly applyPlanActiveRunIdRef: React.MutableRefObject<string | null>;
  readonly applyPlanCompletedRunIdRef: React.MutableRefObject<string | null>;
  readonly lastContextSnapshotIdRef: React.MutableRefObject<string | null>;
  readonly editExplorationContentsRef: React.MutableRefObject<
    readonly ReferencedFileContent[]
  >;
  readonly pipelineCoderResultRef: React.MutableRefObject<PipelineCoderResult | null>;
  readonly executionNoChangeGuardRef: React.MutableRefObject<Map<string, number>>;
  readonly createPlanErrorRef: React.MutableRefObject<string | null>;
}

/** Plan, apply, execution, builder, auto-fix, and patch session state. */
export function useWorkspacePlanState(): WorkspacePlanState {
  const [plan, setPlan] = useState<Plan | null>(null);
  const planRef = useRef<Plan | null>(null);
  const [aiPlan, setAiPlan] = useState<AIPlanResult | null>(null);
  const aiPlanRef = useRef<AIPlanResult | null>(null);
  const [aiPlanStatus, setAiPlanStatus] = useState<AIPlanStatus>("idle");
  const [lastPlanPrompt, setLastPlanPrompt] = useState<string | null>(null);
  const [planApplySession, setPlanApplySession] =
    useState<PlanApplySession | null>(null);
  const [planApplyError, setPlanApplyError] = useState<string | null>(null);
  const [executionSession, setExecutionSession] =
    useState<ExecutionSession | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [builderSession, setBuilderSession] = useState<BuilderSession | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const builderControlRef = useRef({ paused: false, stopped: false });
  const builderSkipApprovalRef = useRef<string | null>(null);
  const [autoFixSession, setAutoFixSession] = useState<AutoFixSession | null>(null);
  const [aiPatchSession, setAiPatchSession] = useState<AIPatchSession | null>(null);
  const [patchStatus, setPatchStatus] = useState<AIPatchStatus>("idle");
  const [patchError, setPatchError] = useState<string | null>(null);
  const [aiPatchApproved, setAiPatchApproved] = useState(false);
  const [aiPatchApplyStatus, setAiPatchApplyStatus] =
    useState<AIPatchApplyStatus>("idle");
  const [aiPatchApplyError, setAiPatchApplyError] = useState<string | null>(null);
  const applyPlanSuccessRef = useRef<ApplyPlanSuccessOutcome | null>(null);
  const applyPlanActiveRunIdRef = useRef<string | null>(null);
  const applyPlanCompletedRunIdRef = useRef<string | null>(null);
  const lastContextSnapshotIdRef = useRef<string | null>(null);
  const editExplorationContentsRef = useRef<readonly ReferencedFileContent[]>([]);
  const pipelineCoderResultRef = useRef<PipelineCoderResult | null>(null);
  const executionNoChangeGuardRef = useRef(new Map<string, number>());
  const createPlanErrorRef = useRef<string | null>(null);

  return {
    plan,
    setPlan,
    planRef,
    aiPlan,
    setAiPlan,
    aiPlanRef,
    aiPlanStatus,
    setAiPlanStatus,
    lastPlanPrompt,
    setLastPlanPrompt,
    planApplySession,
    setPlanApplySession,
    planApplyError,
    setPlanApplyError,
    executionSession,
    setExecutionSession,
    executionError,
    setExecutionError,
    builderSession,
    setBuilderSession,
    builderError,
    setBuilderError,
    builderControlRef,
    builderSkipApprovalRef,
    autoFixSession,
    setAutoFixSession,
    aiPatchSession,
    setAiPatchSession,
    patchStatus,
    setPatchStatus,
    patchError,
    setPatchError,
    aiPatchApproved,
    setAiPatchApproved,
    aiPatchApplyStatus,
    setAiPatchApplyStatus,
    aiPatchApplyError,
    setAiPatchApplyError,
    applyPlanSuccessRef,
    applyPlanActiveRunIdRef,
    applyPlanCompletedRunIdRef,
    lastContextSnapshotIdRef,
    editExplorationContentsRef,
    pipelineCoderResultRef,
    executionNoChangeGuardRef,
    createPlanErrorRef,
  };
}
