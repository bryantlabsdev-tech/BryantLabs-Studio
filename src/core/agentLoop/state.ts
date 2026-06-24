import { detectAgentLoopMode } from "@/core/agentLoop/investigation";
import { initialTasksForMode } from "@/core/agentLoop/planner";
import type {
  AgentFlags,
  AgentReasoningStep,
  AgentLoopSession,
  AgentLoopStatus,
} from "@/core/agentLoop/types";

let stepCounter = 0;

export const DEFAULT_MAX_ITERATIONS = 40;

export function emptyAgentFlags(): AgentFlags {
  return {
    searchedTerms: [],
    readPaths: [],
    readFileContents: {},
    grepQueries: [],
    symbolHits: [],
    referenceSymbol: null,
    planCreated: false,
    planAttempts: 0,
    planLastError: null,
    plannedFileCount: 0,
    plannedNewFileCount: 0,
    executionDone: false,
    autoFixAttempts: 0,
    lastVerificationOk: null,
    investigationComplete: false,
    rootCause: null,
    completionSummary: null,
    commandsRun: [],
    mcpToolsInvoked: [],
  };
}

export function createAgentLoopSession(goal: string): AgentLoopSession {
  const trimmed = goal.trim();
  const mode = detectAgentLoopMode(trimmed);
  return {
    goal: trimmed,
    mode,
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    iteration: 0,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    dynamicTasks: initialTasksForMode(mode, trimmed),
    observations: [`Goal: ${trimmed}`, `Mode: ${mode}`],
    reasoningLog: [],
    pendingApproval: null,
    flags: emptyAgentFlags(),
  };
}

export function appendObservation(
  session: AgentLoopSession,
  text: string,
): AgentLoopSession {
  const line = text.trim();
  if (!line) return session;
  const observations = [...session.observations, line].slice(-60);
  return { ...session, observations };
}

export function appendReasoningStep(
  session: AgentLoopSession,
  step: Omit<AgentReasoningStep, "id" | "at">,
): AgentLoopSession {
  stepCounter += 1;
  const entry: AgentReasoningStep = {
    ...step,
    id: `reason-${Date.now()}-${stepCounter}`,
    at: Date.now(),
  };
  return {
    ...session,
    reasoningLog: [...session.reasoningLog, entry].slice(-100),
  };
}

export function patchAgentFlags(
  session: AgentLoopSession,
  patch: Partial<AgentFlags>,
): AgentLoopSession {
  return {
    ...session,
    flags: { ...session.flags, ...patch },
  };
}

export function setAgentLoopStatus(
  session: AgentLoopSession,
  status: AgentLoopStatus,
): AgentLoopSession {
  const ended =
    status === "completed" ||
    status === "stopped" ||
    status === "failed";
  return {
    ...session,
    status,
    ...(ended ? { endedAt: Date.now() } : {}),
  };
}

export function incrementIteration(
  session: AgentLoopSession,
): AgentLoopSession {
  return { ...session, iteration: session.iteration + 1 };
}
