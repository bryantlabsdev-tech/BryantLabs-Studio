import { executeAgentAction, type AgentActCallbacks } from "@/core/agentLoop/act";
import {
  decideNextAction,
  isGoalSatisfied,
} from "@/core/agentLoop/reasoning";
import { checkActionSafety } from "@/core/agentLoop/safety";
import {
  appendReasoningStep,
  incrementIteration,
  setAgentLoopStatus,
} from "@/core/agentLoop/state";
import type {
  AgentActionParams,
  AgentLoopSession,
  AgentThinkResult,
} from "@/core/agentLoop/types";

const LOOP_DELAY_MS = 120;

export interface AgentLoopControl {
  isStopped(): boolean;
  isPaused(): boolean;
  waitForApproval(): Promise<boolean>;
  delay(ms: number): Promise<void>;
  onSessionUpdate(session: AgentLoopSession): void;
  onReasoningFeed?(input: {
    thought: string;
    reason: string;
    action: string;
    result: string | null;
    ok: boolean;
  }): void;
}

export type AgentDecideNextAction = (
  session: AgentLoopSession,
) => AgentThinkResult | Promise<AgentThinkResult>;

export interface AgentLoopOptions {
  readonly safetyContext?: {
    newFileCount?: number;
    modifyFileCount?: number;
  };
  /** When set, replaces rule-based `decideNextAction` (e.g. provider tool-calling). */
  readonly decideNextAction?: AgentDecideNextAction;
}

/**
 * Observe → Think → Act loop until goal completion, stop, or max iterations.
 */
export async function runAgentLoop(
  initial: AgentLoopSession,
  actCallbacks: AgentActCallbacks,
  control: AgentLoopControl,
  options?: AgentLoopOptions,
): Promise<AgentLoopSession> {
  let session = initial;

  while (
    (session.status === "running" || session.status === "awaiting_approval") &&
    session.iteration < session.maxIterations
  ) {
    if (control.isStopped()) {
      session = setAgentLoopStatus(session, "stopped");
      control.onSessionUpdate(session);
      return session;
    }

    if (control.isPaused()) {
      session = setAgentLoopStatus(session, "paused");
      control.onSessionUpdate(session);
      await control.delay(300);
      continue;
    }

    if (session.status === "awaiting_approval") {
      const approved = await control.waitForApproval();
      if (!approved) {
        session = setAgentLoopStatus(session, "stopped");
        control.onSessionUpdate(session);
        return session;
      }
      session = {
        ...session,
        pendingApproval: null,
        status: "running",
      };
      control.onSessionUpdate(session);
    }

    session = incrementIteration(session);

    const decide = options?.decideNextAction ?? decideNextAction;
    const think = await decide(session);

    const safety = checkActionSafety(
      think.action,
      think.params,
      session,
      {
        goal: session.goal,
        newFileCount:
          options?.safetyContext?.newFileCount ??
          session.flags.plannedNewFileCount,
        modifyFileCount:
          options?.safetyContext?.modifyFileCount ??
          session.flags.plannedFileCount,
      },
    );

    if (safety.needsApproval && think.action !== "complete_task") {
      session = {
        ...session,
        status: "awaiting_approval",
        pendingApproval: {
          action: think.action,
          params: think.params,
          summary: safety.reason,
        },
      };
      session = appendReasoningStep(session, {
        thought: think.thought,
        reason: think.reason,
        action: think.action,
        actionDetail: think.actionDetail,
        result: `Awaiting approval: ${safety.reason}`,
        ok: true,
      });
      control.onSessionUpdate(session);
      continue;
    }

    const { session: afterAct, result } = await executeAgentAction(
      session,
      think.action,
      think.params,
      actCallbacks,
    );

    session = appendReasoningStep(afterAct, {
      thought: think.thought,
      reason: think.reason,
      action: think.action,
      actionDetail: think.actionDetail,
      result: result.observation,
      ok: result.ok,
    });

    control.onReasoningFeed?.({
      thought: think.thought,
      reason: think.reason,
      action: think.actionDetail,
      result: result.observation,
      ok: result.ok,
    });

    if (result.needsApproval && result.approvalSummary) {
      session = {
        ...session,
        status: "awaiting_approval",
        pendingApproval: {
          action: think.action,
          params: think.params,
          summary: result.approvalSummary,
        },
      };
      control.onSessionUpdate(session);
      continue;
    }

    control.onSessionUpdate(session);

    if (result.done || think.action === "complete_task") {
      session = setAgentLoopStatus(session, "completed");
      control.onSessionUpdate(session);
      return session;
    }

    if (think.action === "request_user_input") {
      session = setAgentLoopStatus(session, "paused");
      control.onSessionUpdate(session);
      return session;
    }

    if (isGoalSatisfied(session) && session.mode === "goal") {
      const done = await executeAgentAction(
        session,
        "complete_task",
        { message: session.flags.completionSummary ?? "Goal satisfied." },
        actCallbacks,
      );
      session = setAgentLoopStatus(done.session, "completed");
      control.onSessionUpdate(session);
      return session;
    }

    await control.delay(LOOP_DELAY_MS);
  }

  if (session.iteration >= session.maxIterations) {
    session = setAgentLoopStatus(session, "failed");
    session = {
      ...session,
      observations: [
        ...session.observations,
        "Stopped: maximum agent iterations reached.",
      ],
    };
  }
  control.onSessionUpdate(session);
  return session;
}

/** Run a single approved action after user confirms a gated step. */
export async function runApprovedAgentAction(
  session: AgentLoopSession,
  actCallbacks: AgentActCallbacks,
): Promise<AgentLoopSession> {
  const pending = session.pendingApproval;
  if (!pending) return session;

  const think = decideNextAction(session);
  const action = pending.action;
  const params: AgentActionParams = pending.params;

  const { session: after, result } = await executeAgentAction(
    session,
    action,
    params,
    actCallbacks,
  );

  let next = appendReasoningStep(after, {
    thought: think.thought,
    reason: `Approved: ${pending.summary}`,
    action,
    actionDetail: `${action} (approved)`,
    result: result.observation,
    ok: result.ok,
  });

  next = {
    ...next,
    pendingApproval: null,
    status: "running",
  };

  return next;
}
