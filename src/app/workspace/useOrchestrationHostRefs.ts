import { useRef, type RefObject } from "react";
import type {
  AIPatchOrchestrationHost,
  ApplyPlanOrchestrationHost,
  AutoFixOrchestrationHost,
  AgentOrchestrationHost,
  BuildPipelineHost,
  BuilderOrchestrationHost,
  ExecutionOrchestrationHost,
  FailureReportOrchestrationHost,
  PlanningOrchestrationHost,
  ProviderInvokeOrchestrationHost,
  SafeEditOrchestrationHost,
  StudioActionOrchestrationHost,
  VerificationOrchestrationHost,
} from "@/app/orchestration";

export interface OrchestrationHostRefs {
  readonly orchestrationHostRef: RefObject<BuildPipelineHost | null>;
  readonly applyPlanHostRef: RefObject<ApplyPlanOrchestrationHost | null>;
  readonly planningHostRef: RefObject<PlanningOrchestrationHost | null>;
  readonly aiPatchHostRef: RefObject<AIPatchOrchestrationHost | null>;
  readonly executionHostRef: RefObject<ExecutionOrchestrationHost | null>;
  readonly builderHostRef: RefObject<BuilderOrchestrationHost | null>;
  readonly agentHostRef: RefObject<AgentOrchestrationHost | null>;
  readonly autoFixHostRef: RefObject<AutoFixOrchestrationHost | null>;
  readonly studioActionHostRef: RefObject<StudioActionOrchestrationHost | null>;
  readonly providerInvokeHostRef: RefObject<ProviderInvokeOrchestrationHost | null>;
  readonly providerInvokeStopRef: RefObject<string | null>;
  readonly providerRequestSentRef: RefObject<boolean>;
  readonly failureReportHostRef: RefObject<FailureReportOrchestrationHost | null>;
  readonly verificationHostRef: RefObject<VerificationOrchestrationHost | null>;
  readonly safeEditHostRef: RefObject<SafeEditOrchestrationHost | null>;
}

export function useOrchestrationHostRefs(): OrchestrationHostRefs {
  const orchestrationHostRef = useRef<BuildPipelineHost | null>(null);
  const applyPlanHostRef = useRef<ApplyPlanOrchestrationHost | null>(null);
  const planningHostRef = useRef<PlanningOrchestrationHost | null>(null);
  const aiPatchHostRef = useRef<AIPatchOrchestrationHost | null>(null);
  const executionHostRef = useRef<ExecutionOrchestrationHost | null>(null);
  const builderHostRef = useRef<BuilderOrchestrationHost | null>(null);
  const agentHostRef = useRef<AgentOrchestrationHost | null>(null);
  const autoFixHostRef = useRef<AutoFixOrchestrationHost | null>(null);
  const studioActionHostRef = useRef<StudioActionOrchestrationHost | null>(null);
  const providerInvokeHostRef = useRef<ProviderInvokeOrchestrationHost | null>(null);
  const providerInvokeStopRef = useRef<string | null>(null);
  const providerRequestSentRef = useRef<boolean>(false);
  const failureReportHostRef = useRef<FailureReportOrchestrationHost | null>(null);
  const verificationHostRef = useRef<VerificationOrchestrationHost | null>(null);
  const safeEditHostRef = useRef<SafeEditOrchestrationHost | null>(null);

  return {
    orchestrationHostRef,
    applyPlanHostRef,
    planningHostRef,
    aiPatchHostRef,
    executionHostRef,
    builderHostRef,
    agentHostRef,
    autoFixHostRef,
    studioActionHostRef,
    providerInvokeHostRef,
    providerInvokeStopRef,
    providerRequestSentRef,
    failureReportHostRef,
    verificationHostRef,
    safeEditHostRef,
  };
}
