import type { CenterTab } from "@/core/layout/types";
import { isRunTerminal } from "@/core/agent/runTerminal";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

export interface ExecutionTabSwitchState {
  readonly userPinnedNonExecution: boolean;
  readonly wasInProgress: boolean;
  readonly savedTab: CenterTab | null;
}

export const INITIAL_EXECUTION_TAB_SWITCH_STATE: ExecutionTabSwitchState = {
  userPinnedNonExecution: false,
  wasInProgress: false,
  savedTab: null,
};

export function resolveRunInProgress(input: {
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly activeAgentRunId: string | null;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
}): boolean {
  if (isRunTerminal(input.greenfieldRun)) return false;
  return (
    input.activeAgentRunId != null ||
    input.buildRunning ||
    input.pipelineRunning ||
    input.greenfieldRun.runStartedAt != null
  );
}

export function shouldPinCenterTabDuringRun(
  runInProgress: boolean,
  centerTab: CenterTab,
): boolean {
  return runInProgress && centerTab !== "execution";
}

export function evaluateExecutionTabOnRunProgress(
  state: ExecutionTabSwitchState,
  input: { readonly runInProgress: boolean; readonly centerTab: CenterTab },
): { readonly nextState: ExecutionTabSwitchState; readonly tabToSet: CenterTab | null } {
  if (input.runInProgress && !state.wasInProgress) {
    if (input.centerTab !== "execution" && !state.userPinnedNonExecution) {
      return {
        nextState: {
          userPinnedNonExecution: state.userPinnedNonExecution,
          wasInProgress: true,
          savedTab: input.centerTab,
        },
        tabToSet: "execution",
      };
    }
    return {
      nextState: { ...state, wasInProgress: true },
      tabToSet: null,
    };
  }

  if (!input.runInProgress && state.wasInProgress) {
    return {
      nextState: {
        userPinnedNonExecution: false,
        wasInProgress: false,
        savedTab: null,
      },
      tabToSet: state.savedTab,
    };
  }

  return { nextState: state, tabToSet: null };
}

export function applyUserCenterTabPin(
  state: ExecutionTabSwitchState,
  input: { readonly runInProgress: boolean; readonly centerTab: CenterTab },
): ExecutionTabSwitchState {
  if (!shouldPinCenterTabDuringRun(input.runInProgress, input.centerTab)) {
    return state;
  }
  return {
    ...state,
    userPinnedNonExecution: true,
    savedTab: input.centerTab,
  };
}
