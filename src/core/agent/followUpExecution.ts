import { readUseAgentLoopForEdits } from "@/core/build/followUpAgentLoop";
import { hasProjectScaffoldMarkers } from "@/core/agent/projectIntentRouting";
import type {
  AgentExecutionKind,
  AgentRouteDecisionTrace,
} from "@/core/agent/unifiedAgentRoute";
import type { AgentScanStatus } from "@/core/agent/agentReadiness";
import type { ProjectScan } from "@/types";

export const GREENFIELD_BLOCKED_BY_ROUTE_LABEL =
  "Greenfield blocked by route decision";

export const GREENFIELD_BLOCKED_BY_ROUTE_DETAIL =
  "Empty-folder greenfield hijack skipped — route selected build_loop for existing project edit.";

export type FollowUpSubmitAction =
  | { readonly kind: "no_project" }
  | { readonly kind: "greenfield" }
  | { readonly kind: "greenfield_recovery" }
  | {
      readonly kind: "build_loop";
      readonly greenfieldBlockedByRoute: boolean;
    }
  | {
      readonly kind: "agent_loop";
      readonly greenfieldBlockedByRoute: boolean;
    }
  | { readonly kind: "blocked_scan"; readonly reason: string }
  | { readonly kind: "wait_for_rescan"; readonly reason: string };

export interface FollowUpSubmitHandlers {
  readonly startGreenfield: (prompt: string) => void;
  readonly startBuildLoop: (prompt: string) => void;
  readonly startAgent: (prompt: string) => void;
  readonly requestRescan: () => void;
  readonly block: (reason: string) => void;
}

/** Dispatch a resolved follow-up action. Greenfield is never started for edit routes. */
export function executeFollowUpSubmitAction(
  action: FollowUpSubmitAction,
  prompt: string,
  handlers: FollowUpSubmitHandlers,
): void {
  switch (action.kind) {
    case "greenfield":
    case "greenfield_recovery":
      handlers.startGreenfield(prompt);
      return;
    case "build_loop":
      handlers.startBuildLoop(prompt);
      return;
    case "agent_loop":
      handlers.startAgent(prompt);
      return;
    case "wait_for_rescan":
      handlers.requestRescan();
      return;
    case "blocked_scan":
      handlers.block(action.reason);
      return;
    case "no_project":
      handlers.block("Open a project folder before requesting changes.");
      return;
  }
}

export function routeExecutionFromDecision(
  decision: AgentRouteDecisionTrace | null | undefined,
  fallback: AgentExecutionKind = "build_loop",
): AgentExecutionKind {
  if (!decision || decision.selectedRoute === "pending") return fallback;
  if (decision.selectedRoute === "greenfield") return "greenfield";
  if (decision.selectedRoute === "greenfield_recovery") return "greenfield_recovery";
  if (decision.selectedRoute === "build_loop") return "build_loop";
  return fallback;
}

export function isProjectIndexReadyForEdit(input: {
  readonly scan: ProjectScan | null;
  readonly scanStatus: AgentScanStatus;
  readonly fallbackSourceFileCount?: number;
  readonly filesWritten?: readonly string[];
}): boolean {
  if (input.scan) return true;
  if ((input.fallbackSourceFileCount ?? 0) > 0) return true;
  if (
    input.filesWritten &&
    input.filesWritten.length > 0 &&
    hasProjectScaffoldMarkers(null, input.filesWritten)
  ) {
    return true;
  }
  if (input.scanStatus === "scanning") {
    return (
      (input.fallbackSourceFileCount ?? 0) > 0 ||
      (input.filesWritten?.length ?? 0) > 0
    );
  }
  return false;
}

/**
 * Resolves how a follow-up submit should execute. Routing (`routeAgentPrompt`) is
 * authoritative — stale `emptyProjectFolder` must not override `build_loop`.
 */
export function resolveFollowUpSubmitAction(input: {
  readonly hasProject: boolean;
  readonly routeExecution: AgentExecutionKind;
  readonly emptyProjectFolder: boolean;
  readonly scan: ProjectScan | null;
  readonly scanStatus: AgentScanStatus;
  readonly fallbackSourceFileCount?: number;
  readonly filesWritten?: readonly string[];
  readonly projectSourceFilesExistOnDisk?: boolean;
  readonly previousSuccessfulRun?: boolean;
  /** When omitted, reads `readUseAgentLoopForEdits()` (default on). */
  readonly useAgentLoopForEdits?: boolean;
}): FollowUpSubmitAction {
  if (!input.hasProject) {
    return { kind: "no_project" };
  }

  if (
    input.routeExecution === "consultation" ||
    input.routeExecution === "mixed_confirm" ||
    input.routeExecution === "run_command"
  ) {
    return {
      kind: "blocked_scan",
      reason: "Read-only consultation cannot start an edit run.",
    };
  }

  if (input.routeExecution === "blocked") {
    if (
      (input.scanStatus === "scanning" || input.scanStatus === "idle") &&
      (input.projectSourceFilesExistOnDisk ||
        input.previousSuccessfulRun ||
        (input.filesWritten?.length ?? 0) > 0)
    ) {
      return {
        kind: "wait_for_rescan",
        reason: "Waiting for project scan to finish…",
      };
    }
    return {
      kind: "blocked_scan",
      reason: "Prompt could not be routed.",
    };
  }

  if (input.routeExecution === "greenfield") {
    if (
      input.projectSourceFilesExistOnDisk ||
      input.previousSuccessfulRun ||
      (input.fallbackSourceFileCount ?? 0) > 0 ||
      (input.filesWritten?.length ?? 0) > 0
    ) {
      return {
        kind: "wait_for_rescan",
        reason: "Waiting for project scan to finish…",
      };
    }
    return { kind: "greenfield" };
  }

  if (input.routeExecution === "greenfield_recovery") {
    return { kind: "greenfield_recovery" };
  }

  const greenfieldBlockedByRoute = input.emptyProjectFolder;

  if (
    !isProjectIndexReadyForEdit({
      scan: input.scan,
      scanStatus: input.scanStatus,
      ...(input.fallbackSourceFileCount !== undefined
        ? { fallbackSourceFileCount: input.fallbackSourceFileCount }
        : {}),
      ...(input.filesWritten !== undefined ? { filesWritten: input.filesWritten } : {}),
    })
  ) {
    return {
      kind: "blocked_scan",
      reason: "Project index is not ready yet. Wait for scanning to finish.",
    };
  }

  const useAgentLoop =
    input.useAgentLoopForEdits ?? readUseAgentLoopForEdits();
  if (useAgentLoop) {
    return { kind: "agent_loop", greenfieldBlockedByRoute };
  }

  return { kind: "build_loop", greenfieldBlockedByRoute };
}

export function isFollowUpEditSubmitAction(action: FollowUpSubmitAction): boolean {
  return action.kind === "build_loop" || action.kind === "agent_loop";
}
