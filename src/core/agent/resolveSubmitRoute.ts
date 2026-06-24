import {
  buildGreenfieldRecoveryContext,
  incompleteGreenfieldEditBlockMessage,
  shouldBlockEditForIncompleteGreenfield,
  shouldRouteGreenfieldRecovery,
} from "@/core/agent/greenfieldRecoveryRouting";
import {
  routeAgentPrompt,
  type ComposerModeOverride,
  type RouteAgentPromptResult,
} from "@/core/agent/unifiedAgentRoute";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { ProjectScan } from "@/types";

export function resolveAgentSubmitRoute(input: {
  readonly prompt: string;
  readonly projectOpen: boolean;
  readonly projectPath: string | null;
  readonly scan: ProjectScan | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly modeOverride?: ComposerModeOverride;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly lastArtifact?: AgentRunArtifact | null;
  readonly fallbackSourceFileCount?: number;
}): RouteAgentPromptResult {
  const trimmed = input.prompt.trim();
  const recoveryContext = buildGreenfieldRecoveryContext({
    prompt: trimmed,
    projectPath: input.projectPath,
    greenfieldRun: input.greenfieldRun,
    ...(input.lastArtifact !== undefined ? { lastArtifact: input.lastArtifact } : {}),
  });
  const greenfieldRecovery = shouldRouteGreenfieldRecovery(
    recoveryContext,
    input.greenfieldRun,
  );

  if (
    !greenfieldRecovery &&
    shouldBlockEditForIncompleteGreenfield({
      projectPath: input.projectPath,
      greenfieldRun: input.greenfieldRun,
    })
  ) {
    const blockedDecision = {
      candidates: ["greenfield_recovery", "build_loop"],
      scannedSourceCount: 0,
      sourceCountUsed: 0,
      fallbackSourceCount: input.fallbackSourceFileCount ?? 0,
      greenfieldRejected: true,
      greenfieldRejectReason: "incomplete_greenfield_setup",
      selectedRoute: "blocked",
      selectionReason: "incomplete_greenfield_edit_blocked",
    };
    return {
      mode: "create_new_app",
      reason: "incomplete_greenfield_edit_blocked",
      execution: "blocked",
      intent: "blocked",
      blockedReason: incompleteGreenfieldEditBlockMessage(input.greenfieldRun),
      activityNote: null,
      needsEmptyFolder: false,
      decision: blockedDecision,
    };
  }

  return routeAgentPrompt({
    prompt: trimmed,
    projectOpen: input.projectOpen,
    projectPath: input.projectPath,
    scan: input.scan,
    scanStatus: input.scanStatus,
    ...(input.modeOverride !== undefined ? { modeOverride: input.modeOverride } : {}),
    filesWritten: input.greenfieldRun.filesWritten,
    previousSuccessfulRun:
      input.greenfieldRun.runResult === "success" &&
      input.greenfieldRun.filesWritten.length > 0,
    greenfieldRecovery,
    greenfieldRecoveryReason: greenfieldRecovery
      ? `failed_greenfield_${recoveryContext?.failedStage ?? recoveryContext?.errorCategory ?? "setup"}`
      : null,
    ...(input.fallbackSourceFileCount !== undefined
      ? { fallbackSourceFileCount: input.fallbackSourceFileCount }
      : {}),
  });
}
