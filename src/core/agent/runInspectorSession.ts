import type { RunInspectorTab } from "@/core/agent/runInspector";

export interface RunInspectorSession {
  readonly modalOpen: boolean;
  /** Run locked for modal or center Inspector tab — survives live updates. */
  readonly lockedRunId: string | null;
  readonly tab: RunInspectorTab;
  readonly centerInspectorActive: boolean;
}

export const EMPTY_RUN_INSPECTOR_SESSION: RunInspectorSession = {
  modalOpen: false,
  lockedRunId: null,
  tab: "timeline",
  centerInspectorActive: false,
};

export type RunInspectorSessionAction =
  | { readonly type: "open_modal"; readonly runId: string }
  | { readonly type: "close_modal" }
  | { readonly type: "set_tab"; readonly tab: RunInspectorTab }
  | { readonly type: "center_inspector_active"; readonly runId: string | null }
  | { readonly type: "lock_run"; readonly runId: string };

export function reduceRunInspectorSession(
  state: RunInspectorSession,
  action: RunInspectorSessionAction,
): RunInspectorSession {
  switch (action.type) {
    case "open_modal":
      return {
        ...state,
        modalOpen: true,
        lockedRunId: action.runId,
      };
    case "close_modal":
      return {
        ...state,
        modalOpen: false,
        lockedRunId: state.centerInspectorActive ? state.lockedRunId : null,
      };
    case "set_tab":
      return { ...state, tab: action.tab };
    case "center_inspector_active":
      if (action.runId) {
        return {
          ...state,
          centerInspectorActive: true,
          lockedRunId: state.lockedRunId ?? action.runId,
        };
      }
      return {
        ...state,
        centerInspectorActive: false,
        lockedRunId: state.modalOpen ? state.lockedRunId : null,
      };
    case "lock_run":
      return { ...state, lockedRunId: action.runId };
    default:
      return state;
  }
}

export function resolveInspectorLockedRunId(
  session: RunInspectorSession,
  fallbackRunId: string | null,
): string | null {
  return session.lockedRunId ?? fallbackRunId;
}

export function isInspectorRunListed(
  runId: string,
  input: {
    readonly activeAgentRunId: string | null;
    readonly historyRunIds: readonly string[];
  },
): boolean {
  if (input.activeAgentRunId === runId) return true;
  return input.historyRunIds.includes(runId);
}
