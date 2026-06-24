import { useRef, useState } from "react";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { ExecutionLoopResult } from "@/app/orchestration/executionTypes";

export interface AgentLoopWorkspaceState {
  readonly agentSession: AgentWorkspaceSession | null;
  readonly setAgentSession: React.Dispatch<
    React.SetStateAction<AgentWorkspaceSession | null>
  >;
  readonly agentLoopSession: AgentLoopSession | null;
  readonly setAgentLoopSession: React.Dispatch<
    React.SetStateAction<AgentLoopSession | null>
  >;
  readonly agentLoopError: string | null;
  readonly setAgentLoopError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly agentControlRef: React.MutableRefObject<{
    paused: boolean;
    stopped: boolean;
    safetyApproved: boolean;
    approveResolve: ((ok: boolean) => void) | null;
  }>;
  readonly agentLastExecRef: React.MutableRefObject<ExecutionLoopResult | null>;
}

/** Reasoning agent loop session, feed, and control refs. */
export function useAgentLoopWorkspaceState(): AgentLoopWorkspaceState {
  const [agentSession, setAgentSession] = useState<AgentWorkspaceSession | null>(
    null,
  );
  const [agentLoopSession, setAgentLoopSession] =
    useState<AgentLoopSession | null>(null);
  const [agentLoopError, setAgentLoopError] = useState<string | null>(null);
  const agentControlRef = useRef({
    paused: false,
    stopped: false,
    safetyApproved: false,
    approveResolve: null as ((ok: boolean) => void) | null,
  });
  const agentLastExecRef = useRef<ExecutionLoopResult | null>(null);

  return {
    agentSession,
    setAgentSession,
    agentLoopSession,
    setAgentLoopSession,
    agentLoopError,
    setAgentLoopError,
    agentControlRef,
    agentLastExecRef,
  };
}
