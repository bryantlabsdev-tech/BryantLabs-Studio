import {
  GREENFIELD_BLOCKED_BY_ROUTE_DETAIL,
  GREENFIELD_BLOCKED_BY_ROUTE_LABEL,
  resolveFollowUpSubmitAction,
} from "@/core/agent/followUpExecution";
import type { StudioIntentKind } from "@/core/agent/classifyStudioIntent";
import { hasEstablishedAppContext } from "@/core/agent/agentAppContext";

import { assessPromptClarity } from "@/core/agent/promptConfidence";
import {
  hashPrompt,
  logRunSubmitDebug,
  promptPreview,
} from "@/core/agent/runContextReset";
import {
  canCreateInCurrentFolder,
  type ComposerModeOverride,
  type RouteAgentPromptResult,
} from "@/core/agent/unifiedAgentRoute";
import {
  logPromptSubmission,
  LONG_PROMPT_AUTO_PROCEED_CHARS,
} from "@/core/agent/promptSubmission";
import { resolveAgentSubmitRoute } from "@/core/agent/resolveSubmitRoute";

import {
  detectGreenfieldProject,
  logGreenfieldDetection,
} from "@/core/agent/greenfieldDetection";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { CurrentAppContext } from "@/core/agent/agentAppContext";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { FeasibilityResult } from "@/core/intelligence";
import type { ProjectScan } from "@/types";
import { studioEventBus } from "@/core/console/studioEventBus";

export interface BuildViewSubmitFlowInput {
  readonly trimmed: string;
  readonly hasProject: boolean;
  readonly projectPath: string | null;
  readonly scan: ProjectScan | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly modeOverride: ComposerModeOverride;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly lastArtifact: AgentRunArtifact | null;
  readonly greenfieldFallbackCount: number | undefined;
  readonly currentAppContext: CurrentAppContext | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly analyzeFeasibility: (prompt: string) => FeasibilityResult;
  readonly activeAgentRunId: string | null;
  readonly providerSettings: { provider: string } | null;
  readonly providerStatus: { provider?: string; model?: string } | null;
}

export type BuildViewSubmitGate =
  | { readonly kind: "clarity"; readonly prompt: string; readonly question: string }
  | { readonly kind: "feasibility"; readonly result: FeasibilityResult }
  | { readonly kind: "stale"; readonly prompt: string; readonly intent: StudioIntentKind; readonly route: RouteAgentPromptResult }
  | { readonly kind: "folder"; readonly pendingPrompt: string }
  | { readonly kind: "greenfield"; readonly prompt: string; readonly recovery: boolean }
  | { readonly kind: "follow_up"; readonly prompt: string; readonly route: Pick<RouteAgentPromptResult, "execution" | "intent"> }
  | { readonly kind: "blocked"; readonly message: string; readonly openProject?: boolean };

export function resolveBuildViewSubmitRoute(
  input: BuildViewSubmitFlowInput,
): RouteAgentPromptResult {
  return resolveAgentSubmitRoute({
    prompt: input.trimmed,
    projectOpen: input.hasProject,
    projectPath: input.projectPath,
    scan: input.scan,
    scanStatus: input.scanStatus,
    modeOverride: input.modeOverride,
    greenfieldRun: input.greenfieldRun,
    lastArtifact: input.lastArtifact,
    ...(input.greenfieldFallbackCount !== undefined
      ? { fallbackSourceFileCount: input.greenfieldFallbackCount }
      : {}),
  });
}

export function evaluateBuildViewSubmit(
  input: BuildViewSubmitFlowInput,
  route: RouteAgentPromptResult,
): BuildViewSubmitGate | { readonly kind: "ok" } {
  if (route.execution === "greenfield" || route.execution === "greenfield_recovery") {
    const canCreateHere =
      route.execution === "greenfield_recovery" ||
      canCreateInCurrentFolder({
        scan: input.scan,
        scanStatus: input.scanStatus,
        ...(input.greenfieldFallbackCount !== undefined
          ? { fallbackSourceFileCount: input.greenfieldFallbackCount }
          : {}),
      });
    if (!input.hasProject) {
      return { kind: "folder", pendingPrompt: input.trimmed };
    }
    if (!canCreateHere) {
      return { kind: "blocked", message: "", openProject: true };
    }
    return {
      kind: "greenfield",
      prompt: input.trimmed,
      recovery: route.execution === "greenfield_recovery",
    };
  }

  const clarity = assessPromptClarity(input.trimmed, {
    hasAppContext: hasEstablishedAppContext(
      input.currentAppContext,
      input.sessionMemory,
    ),
    hasProject: input.hasProject,
  });
  if (clarity.confidence === "low" && clarity.question) {
    return { kind: "clarity", prompt: input.trimmed, question: clarity.question };
  }

  const feasibility = input.analyzeFeasibility(input.trimmed);
  if (feasibility.requiresConfirmation) {
    if (input.trimmed.length >= LONG_PROMPT_AUTO_PROCEED_CHARS) {
      return {
        kind: "follow_up",
        prompt: input.trimmed,
        route: { execution: route.execution, intent: route.intent },
      };
    }
    return { kind: "feasibility", result: feasibility };
  }

  return {
    kind: "follow_up",
    prompt: input.trimmed,
    route: { execution: route.execution, intent: route.intent },
  };
}

export function logBuildViewSubmitAccepted(
  input: BuildViewSubmitFlowInput,
  route: RouteAgentPromptResult,
): void {
  logRunSubmitDebug({
    prompt: input.trimmed,
    runId: input.activeAgentRunId,
    previousRunId: null,
    route: route.execution,
    provider: input.providerSettings?.provider ?? input.providerStatus?.provider ?? null,
    model: input.providerStatus?.model ?? null,
  });
  logPromptSubmission("submit.accepted", {
    promptLength: input.trimmed.length,
    promptPreview: promptPreview(input.trimmed),
    promptHash: hashPrompt(input.trimmed),
    runId: input.activeAgentRunId,
    projectPath: input.projectPath,
    provider: input.providerSettings?.provider ?? null,
    route: route.execution,
    phase: "queued",
  });
}

export function detectGreenfieldForSubmit(
  input: BuildViewSubmitFlowInput,
  route: RouteAgentPromptResult,
): void {
  const detection = detectGreenfieldProject({
    scan: input.scan,
    scanStatus: input.scanStatus,
    prompt: input.trimmed,
    ...(input.greenfieldFallbackCount !== undefined
      ? { fallbackSourceFileCount: input.greenfieldFallbackCount }
      : {}),
  });
  if (route.execution === "greenfield" || detection.folderEmpty) {
    logGreenfieldDetection(detection, input.projectPath);
  }
}

export function emitFollowUpBlocked(projectPath: string | null, reason: string): void {
  studioEventBus.emit({
    type: "run.blocked",
    timestamp: Date.now(),
    projectPath,
    reason,
  });
}

export { resolveFollowUpSubmitAction, GREENFIELD_BLOCKED_BY_ROUTE_LABEL, GREENFIELD_BLOCKED_BY_ROUTE_DETAIL };
