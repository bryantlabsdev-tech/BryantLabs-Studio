import { resolveAgentSourceFileCount } from "@/core/agent/agentGreenfieldDispatch";
import {
  looksLikeAuditPrompt,
  looksLikeEditExistingProjectPrompt,
  looksLikeExplicitGreenfieldRestart,
  looksLikeRepairPrompt,
} from "@/core/agent/agentPromptPatterns";
import {
  type IntentRouteMode,
} from "@/core/agent/projectIntentRouting";
import {
  routeAgentPrompt,
  type ComposerModeOverride,
  type StudioIntentKind,
} from "@/core/agent/unifiedAgentRoute";
import {
  NON_EMPTY_FOLDER_GREENFIELD_MESSAGE,
} from "@/core/agent/agentGreenfieldDispatch";
import type { ProjectScan } from "@/types";

export type { StudioIntentKind };

export {
  looksLikeAuditPrompt,
  looksLikeEditExistingProjectPrompt,
  looksLikeExplicitGreenfieldRestart,
  looksLikeRepairPrompt,
};

export interface ClassifyStudioIntentInput {
  readonly prompt: string;
  readonly projectOpen: boolean;
  readonly projectPath?: string | null;
  readonly scan: ProjectScan | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  /** Used when scan is not ready yet but files were just written. */
  readonly fallbackSourceFileCount?: number;
  readonly filesWritten?: readonly string[];
  readonly previousSuccessfulRun?: boolean;
  readonly greenfieldRecovery?: boolean;
  /** @deprecated Use modeOverride instead. */
  readonly forceGreenfield?: boolean;
  readonly modeOverride?: ComposerModeOverride;
}

export interface ClassifyStudioIntentResult {
  readonly intent: StudioIntentKind;
  readonly reason: string | null;
  /** Shown when a greenfield-style prompt is treated as follow-up on an existing project. */
  readonly rerouteNote: string | null;
  readonly routeMode: IntentRouteMode;
  readonly routeReason: string | null;
}

export function buildImprovementRerouteNote(prompt: string): string {
  const subjectMatch = prompt.match(
    /\b(sudoku|calculator|todo|dashboard|game|app|website|tool)\b/i,
  );
  if (subjectMatch?.[1]) {
    const raw = subjectMatch[1];
    const subject = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    return `${NON_EMPTY_FOLDER_GREENFIELD_MESSAGE} I'll treat this as an improvement to the existing ${subject} app.`;
  }
  return `${NON_EMPTY_FOLDER_GREENFIELD_MESSAGE} I'll treat this as an improvement request.`;
}

function resolveModeOverride(input: ClassifyStudioIntentInput): ComposerModeOverride {
  if (input.modeOverride) return input.modeOverride;
  if (input.forceGreenfield) return "new_app";
  return "auto";
}

export function classifyStudioIntent(
  input: ClassifyStudioIntentInput,
): ClassifyStudioIntentResult {
  const route = routeAgentPrompt({
    prompt: input.prompt,
    projectOpen: input.projectOpen,
    projectPath: input.projectPath ?? null,
    scan: input.scan,
    scanStatus: input.scanStatus,
    ...(input.fallbackSourceFileCount !== undefined
      ? { fallbackSourceFileCount: input.fallbackSourceFileCount }
      : {}),
    ...(input.filesWritten !== undefined ? { filesWritten: input.filesWritten } : {}),
    ...(input.previousSuccessfulRun !== undefined
      ? { previousSuccessfulRun: input.previousSuccessfulRun }
      : {}),
    ...(input.greenfieldRecovery !== undefined
      ? { greenfieldRecovery: input.greenfieldRecovery }
      : {}),
    modeOverride: resolveModeOverride(input),
  });

  const intent: StudioIntentKind =
    route.execution === "blocked"
      ? "blocked"
      : route.intent === "greenfield"
        ? "greenfield"
        : route.intent;

  const routeMode: IntentRouteMode =
    route.execution === "greenfield" ? "greenfield" : "edit";

  return {
    intent,
    reason: route.blockedReason,
    rerouteNote: route.activityNote,
    routeMode,
    routeReason: route.reason,
  };
}

/** @deprecated Prefer routeAgentPrompt — kept for agentReadiness gate. */
export function resolveSourceFileCountForIntent(input: {
  scan: ProjectScan | null;
  scanStatus: ClassifyStudioIntentInput["scanStatus"];
  fallbackSourceFileCount?: number;
}): number {
  return resolveAgentSourceFileCount(input);
}
