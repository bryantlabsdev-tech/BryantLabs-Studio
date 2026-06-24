import { countProjectSourceFiles, looksLikeGreenfieldNewAppPrompt } from "@/core/agent/agentReadiness";
import {
  isEmptyProjectFolder,
  NO_FOLDER_GREENFIELD_MESSAGE,
  GREENFIELD_EMPTY_FOLDER_ACTIVITY,
  resolveAgentSourceFileCount,
} from "@/core/agent/agentGreenfieldDispatch";
import {
  looksLikeAuditPrompt,
  looksLikeEditExistingProjectPrompt,
  looksLikeExplicitGreenfieldRestart,
  looksLikeRepairPrompt,
} from "@/core/agent/agentPromptPatterns";
import {
  hasProjectScaffoldMarkers,
  promptReferencesCurrentApp,
  resolveEstablishedProject,
} from "@/core/agent/projectIntentRouting";
import type { ProjectScan } from "@/types";

export interface AgentRouteDecisionTrace {
  readonly candidates: readonly string[];
  readonly scannedSourceCount: number;
  readonly sourceCountUsed: number;
  readonly fallbackSourceCount: number;
  readonly greenfieldRejected: boolean;
  readonly greenfieldRejectReason: string | null;
  readonly selectedRoute: string;
  readonly selectionReason: string;
}

export type StudioIntentKind =
  | "greenfield"
  | "follow_up"
  | "repair"
  | "audit"
  | "blocked";

export type AgentRouteMode =
  | "create_new_app"
  | "edit_existing_project"
  | "repair_project"
  | "refactor_project";

export type ComposerModeOverride = "auto" | "new_app" | "edit" | "fix_errors";

export type AgentExecutionKind =
  | "greenfield"
  | "greenfield_recovery"
  | "build_loop"
  | "blocked";

const REFACTOR_PROMPT_PATTERNS: readonly RegExp[] = [
  /\brefactor\b/i,
  /\brestructure\b/i,
  /\breorganize\b/i,
  /\bclean\s+up\s+(the\s+)?(code|codebase|project|app)/i,
];

const EXPLICIT_NEW_APP_PATTERNS: readonly RegExp[] = [
  /\bnew\s+app\b/i,
  /\bnew\s+application\b/i,
  /\bnew\s+project\b/i,
  /\bcreate\s+(a\s+)?new\s+(app|application|project)\b/i,
  /\bbuild\s+(a\s+)?new\s+app\b/i,
  /\bscaffold\s+(a\s+)?new\s+app\b/i,
  /\bbrand\s+new\b[\s\S]{0,48}\b(new\s+folder|in\s+a\s+new)\b/i,
];

export function looksLikeRefactorPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return REFACTOR_PROMPT_PATTERNS.some((re) => re.test(trimmed));
}

export function looksLikeExplicitNewAppRequest(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return (
    EXPLICIT_NEW_APP_PATTERNS.some((re) => re.test(trimmed)) ||
    looksLikeExplicitGreenfieldRestart(trimmed)
  );
}

export interface RouteAgentPromptInput {
  readonly prompt: string;
  readonly projectOpen: boolean;
  readonly projectPath?: string | null;
  readonly scan: ProjectScan | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly fallbackSourceFileCount?: number;
  readonly filesWritten?: readonly string[];
  readonly previousSuccessfulRun?: boolean;
  readonly modeOverride?: ComposerModeOverride;
  /** Same-prompt retry after failed greenfield setup — skip edit_follow_up routing. */
  readonly greenfieldRecovery?: boolean;
  readonly greenfieldRecoveryReason?: string | null;
}

export interface RouteAgentPromptResult {
  readonly mode: AgentRouteMode;
  readonly reason: string;
  readonly execution: AgentExecutionKind;
  readonly intent: StudioIntentKind;
  readonly blockedReason: string | null;
  /** Shown in agent chat — never suggests empty folder when editing an existing project. */
  readonly activityNote: string | null;
  readonly needsEmptyFolder: boolean;
  readonly decision: AgentRouteDecisionTrace;
}

function blocked(
  reason: string,
  decision: AgentRouteDecisionTrace,
  opts?: Partial<RouteAgentPromptResult> & { mode?: AgentRouteMode },
): RouteAgentPromptResult {
  return {
    mode: opts?.mode ?? "edit_existing_project",
    reason: opts?.reason ?? "blocked",
    execution: "blocked",
    intent: "blocked",
    blockedReason: reason,
    activityNote: opts?.activityNote ?? null,
    needsEmptyFolder: opts?.needsEmptyFolder ?? false,
    decision,
  };
}

function createNewAppNeedsFolder(
  reason: string,
  activityNote: string,
  decision: AgentRouteDecisionTrace,
): RouteAgentPromptResult {
  return blocked(
    "Open an empty project folder to create a new app.",
    decision,
    {
      mode: "create_new_app",
      reason,
      needsEmptyFolder: true,
      activityNote,
    },
  );
}

function greenfieldRoute(
  mode: AgentRouteMode,
  reason: string,
  decision: AgentRouteDecisionTrace,
  opts?: { activityNote?: string | null; needsEmptyFolder?: boolean },
): RouteAgentPromptResult {
  return {
    mode,
    reason,
    execution: "greenfield",
    intent: "greenfield",
    blockedReason: null,
    activityNote: opts?.activityNote ?? null,
    needsEmptyFolder: opts?.needsEmptyFolder ?? false,
    decision: {
      ...decision,
      selectedRoute: "greenfield",
      selectionReason: reason,
      greenfieldRejected: false,
      greenfieldRejectReason: null,
    },
  };
}

function greenfieldRecoveryRoute(
  mode: AgentRouteMode,
  reason: string,
  decision: AgentRouteDecisionTrace,
  opts?: { activityNote?: string | null },
): RouteAgentPromptResult {
  return {
    mode,
    reason,
    execution: "greenfield_recovery",
    intent: "greenfield",
    blockedReason: null,
    activityNote:
      opts?.activityNote ??
      "Resuming failed greenfield run — retrying setup without regenerating files.",
    needsEmptyFolder: false,
    decision: {
      ...decision,
      selectedRoute: "greenfield_recovery",
      selectionReason: reason,
      greenfieldRejected: false,
      greenfieldRejectReason: null,
    },
  };
}

function buildLoopRoute(
  mode: AgentRouteMode,
  reason: string,
  intent: StudioIntentKind,
  decision: AgentRouteDecisionTrace,
  opts?: { activityNote?: string | null },
): RouteAgentPromptResult {
  return {
    mode,
    reason,
    execution: "build_loop",
    intent,
    blockedReason: null,
    activityNote: opts?.activityNote ?? null,
    needsEmptyFolder: false,
    decision: {
      ...decision,
      selectedRoute: "build_loop",
      selectionReason: reason,
      greenfieldRejected: true,
      greenfieldRejectReason:
        decision.greenfieldRejectReason ?? "existing_project_edit",
    },
  };
}

function buildRouteDecisionBase(input: {
  readonly scannedSourceCount: number;
  readonly sourceCountUsed: number;
  readonly fallbackSourceCount: number;
  readonly establishedProject: boolean;
  readonly editPhrasing: boolean;
  readonly referencesCurrentApp: boolean;
}): AgentRouteDecisionTrace {
  const candidates = ["greenfield", "build_loop"];
  let greenfieldRejectReason: string | null = null;

  if (input.establishedProject) {
    greenfieldRejectReason = "project_files_or_scaffold_present";
  } else if (input.fallbackSourceCount > 0) {
    greenfieldRejectReason = "fallback_source_files";
  } else if (input.editPhrasing && input.referencesCurrentApp && input.sourceCountUsed > 0) {
    greenfieldRejectReason = "edit_prompt_references_current_app";
  } else if (input.editPhrasing && input.sourceCountUsed > 0) {
    greenfieldRejectReason = "edit_prompt_with_sources";
  }

  return {
    candidates,
    scannedSourceCount: input.scannedSourceCount,
    sourceCountUsed: input.sourceCountUsed,
    fallbackSourceCount: input.fallbackSourceCount,
    greenfieldRejected: greenfieldRejectReason != null,
    greenfieldRejectReason,
    selectedRoute: "pending",
    selectionReason: "pending",
  };
}

function shouldBlockGreenfieldRoute(input: {
  readonly establishedProject: boolean;
  readonly fallbackSourceCount: number;
  readonly filesWritten: readonly string[];
  readonly previousSuccessfulRun: boolean;
  readonly editPhrasing: boolean;
  readonly prompt: string;
}): string | null {
  if (input.establishedProject) {
    return "project_files_or_scaffold_present";
  }
  if (input.fallbackSourceCount > 0) {
    return "fallback_source_files";
  }
  if (
    input.previousSuccessfulRun &&
    input.filesWritten.length > 0
  ) {
    return "previous_successful_run_with_files";
  }
  if (hasProjectScaffoldMarkers(null, input.filesWritten)) {
    return "files_written_scaffold_present";
  }
  const hasProjectEvidence =
    input.establishedProject ||
    input.fallbackSourceCount > 0 ||
    input.filesWritten.length > 0 ||
    input.previousSuccessfulRun;
  if (
    hasProjectEvidence &&
    input.editPhrasing &&
    promptReferencesCurrentApp(input.prompt)
  ) {
    return "edit_prompt_references_current_app";
  }
  return null;
}

export function logAgentRoute(
  mode: AgentRouteMode,
  reason: string,
  projectPath?: string | null,
): void {
  const pathSuffix = projectPath ? ` projectPath=${projectPath}` : "";
  console.log(`[agent:route] mode=${mode} reason=${reason}${pathSuffix}`);
}

export function formatAgentRouteLabel(mode: AgentRouteMode): string {
  switch (mode) {
    case "create_new_app":
      return "Create new app";
    case "edit_existing_project":
      return "Edit project";
    case "repair_project":
      return "Repair";
    case "refactor_project":
      return "Refactor";
  }
}

export function routeAgentPrompt(
  input: RouteAgentPromptInput,
): RouteAgentPromptResult {
  const trimmed = input.prompt.trim();
  const override = input.modeOverride ?? "auto";
  const filesWritten = input.filesWritten ?? [];
  const filesWrittenForRouting = input.greenfieldRecovery ? [] : filesWritten;
  const fallbackSourceCount = input.fallbackSourceFileCount ?? 0;
  const scannedSourceCount = input.scan ? countProjectSourceFiles(input.scan) : 0;
  const sourceFileCount = resolveAgentSourceFileCount({
    scan: input.scan,
    scanStatus: input.scanStatus,
    ...(input.fallbackSourceFileCount !== undefined
      ? { fallbackSourceFileCount: input.fallbackSourceFileCount }
      : {}),
  });
  const hasSources = sourceFileCount > 0;
  const establishedProject = resolveEstablishedProject({
    projectOpen: input.projectOpen,
    scan: input.scan,
    ...(input.fallbackSourceFileCount !== undefined
      ? { fallbackSourceFileCount: input.fallbackSourceFileCount }
      : {}),
    filesWritten: filesWrittenForRouting,
    ...(input.previousSuccessfulRun !== undefined
      ? { previousSuccessfulRun: input.previousSuccessfulRun }
      : {}),
  });
  const editPhrasing = looksLikeEditExistingProjectPrompt(trimmed);
  const referencesCurrentApp = promptReferencesCurrentApp(trimmed);
  const greenfieldBlockReason = input.greenfieldRecovery
    ? null
    : shouldBlockGreenfieldRoute({
        establishedProject,
        fallbackSourceCount,
        filesWritten: filesWrittenForRouting,
        previousSuccessfulRun: input.previousSuccessfulRun === true,
        editPhrasing,
        prompt: trimmed,
      });

  const decisionBase = buildRouteDecisionBase({
    scannedSourceCount,
    sourceCountUsed: sourceFileCount,
    fallbackSourceCount,
    establishedProject,
    editPhrasing,
    referencesCurrentApp,
  });
  const decisionWithReject: AgentRouteDecisionTrace = {
    ...decisionBase,
    greenfieldRejected: greenfieldBlockReason != null,
    greenfieldRejectReason: greenfieldBlockReason,
    selectedRoute: decisionBase.selectedRoute,
    selectionReason: decisionBase.selectionReason,
  };

  const emptyFolder = isEmptyProjectFolder({
    scan: input.scan,
    scanStatus: input.scanStatus,
    ...(input.fallbackSourceFileCount !== undefined
      ? { fallbackSourceFileCount: input.fallbackSourceFileCount }
      : {}),
  });

  if (trimmed.length < 4) {
    return blocked("Enter a goal with at least 4 characters.", decisionWithReject);
  }

  if (input.scanStatus === "scanning") {
    const hasIndexFallback =
      (input.fallbackSourceFileCount ?? 0) > 0 ||
      (input.filesWritten?.length ?? 0) > 0;
    if (!hasIndexFallback) {
      return blocked("Waiting for project scan to finish…", decisionWithReject);
    }
  }

  if (input.scanStatus === "error") {
    return blocked(
      "Project scan failed. Try rescanning from the project menu.",
      decisionWithReject,
    );
  }

  if (override === "fix_errors") {
    if (!input.projectOpen) {
      return blocked(
        "Open a project folder before requesting repairs.",
        decisionWithReject,
      );
    }
    return buildLoopRoute(
      "repair_project",
      "override_fix_errors",
      "repair",
      decisionWithReject,
    );
  }

  if (override === "edit") {
    if (!input.projectOpen) {
      return blocked(
        "Open a project folder before requesting changes.",
        decisionWithReject,
      );
    }
    if (!hasSources && !establishedProject) {
      return greenfieldRoute(
        "create_new_app",
        "empty_folder_override_edit",
        decisionWithReject,
        { activityNote: GREENFIELD_EMPTY_FOLDER_ACTIVITY },
      );
    }
    return buildLoopRoute(
      "edit_existing_project",
      "override_edit",
      "follow_up",
      decisionWithReject,
    );
  }

  if (override === "new_app") {
    if (!input.projectOpen) {
      return blocked(NO_FOLDER_GREENFIELD_MESSAGE, decisionWithReject, {
        needsEmptyFolder: true,
      });
    }
    if (establishedProject || hasSources) {
      return createNewAppNeedsFolder(
        "override_new_app_existing_folder",
        "This folder already has a project. Open an empty folder to create a new app.",
        decisionWithReject,
      );
    }
    return greenfieldRoute("create_new_app", "override_new_app", decisionWithReject);
  }

  // --- Auto routing ---

  if (input.greenfieldRecovery) {
    return greenfieldRecoveryRoute(
      "create_new_app",
      input.greenfieldRecoveryReason ?? "failed_greenfield_setup_retry",
      decisionWithReject,
    );
  }

  if (!input.projectOpen) {
    if (editPhrasing || looksLikeRepairPrompt(trimmed)) {
      return blocked(
        "Open a project folder to edit or repair the current app.",
        decisionWithReject,
      );
    }
    if (looksLikeGreenfieldNewAppPrompt(trimmed)) {
      return blocked(NO_FOLDER_GREENFIELD_MESSAGE, decisionWithReject, {
        needsEmptyFolder: true,
      });
    }
    return blocked(
      'Describe the app you want to build (e.g. "Build a CRM dashboard"), or open an existing project folder.',
      decisionWithReject,
    );
  }

  if (!hasSources) {
    if (establishedProject || greenfieldBlockReason) {
      if (looksLikeRepairPrompt(trimmed)) {
        return buildLoopRoute(
          "repair_project",
          "repair_keywords_established",
          "repair",
          decisionWithReject,
        );
      }
      if (looksLikeRefactorPrompt(trimmed)) {
        return buildLoopRoute(
          "refactor_project",
          "refactor_keywords_established",
          "follow_up",
          decisionWithReject,
        );
      }
      if (looksLikeAuditPrompt(trimmed)) {
        return buildLoopRoute(
          "edit_existing_project",
          "audit_keywords_established",
          "audit",
          decisionWithReject,
        );
      }
      if (editPhrasing || referencesCurrentApp) {
        return buildLoopRoute(
          "edit_existing_project",
          "edit_keywords_established",
          "follow_up",
          decisionWithReject,
        );
      }
      return buildLoopRoute(
        "edit_existing_project",
        "established_project",
        "follow_up",
        decisionWithReject,
      );
    }

    if (looksLikeRepairPrompt(trimmed) && !looksLikeGreenfieldNewAppPrompt(trimmed)) {
      return blocked(
        "This folder is empty. Open a project with source files before requesting repairs.",
        decisionWithReject,
      );
    }
    if (
      looksLikeGreenfieldNewAppPrompt(trimmed) ||
      (emptyFolder && input.scanStatus !== "idle")
    ) {
      return greenfieldRoute("create_new_app", "empty_folder", decisionWithReject, {
        activityNote: GREENFIELD_EMPTY_FOLDER_ACTIVITY,
      });
    }
    if (input.scanStatus === "idle") {
      return blocked("Analyzing project…", decisionWithReject);
    }
    if (input.scanStatus !== "done") {
      return blocked("Analyzing project…", decisionWithReject);
    }
    return blocked(
      'Describe a new app to build (e.g. "Create a simple counter app").',
      decisionWithReject,
    );
  }

  if (establishedProject) {
    if (
      looksLikeExplicitNewAppRequest(trimmed) &&
      !editPhrasing &&
      !looksLikeRepairPrompt(trimmed)
    ) {
      return createNewAppNeedsFolder(
        "explicit_new_app",
        "Open an empty folder to create a new app.",
        decisionWithReject,
      );
    }
    if (looksLikeRepairPrompt(trimmed)) {
      return buildLoopRoute(
        "repair_project",
        "repair_keywords",
        "repair",
        decisionWithReject,
      );
    }
    if (looksLikeRefactorPrompt(trimmed)) {
      return buildLoopRoute(
        "refactor_project",
        "refactor_keywords",
        "follow_up",
        decisionWithReject,
      );
    }
    if (looksLikeAuditPrompt(trimmed)) {
      return buildLoopRoute(
        "edit_existing_project",
        "audit_keywords",
        "audit",
        decisionWithReject,
      );
    }
    if (editPhrasing) {
      return buildLoopRoute(
        "edit_existing_project",
        "edit_keywords",
        "follow_up",
        decisionWithReject,
      );
    }
    if (looksLikeGreenfieldNewAppPrompt(trimmed)) {
      return buildLoopRoute(
        "edit_existing_project",
        "existing_project",
        "follow_up",
        decisionWithReject,
      );
    }
    return buildLoopRoute(
      "edit_existing_project",
      "existing_project",
      "follow_up",
      decisionWithReject,
    );
  }

  if (hasSources) {
    if (
      looksLikeExplicitGreenfieldRestart(trimmed) &&
      !editPhrasing &&
      !looksLikeRepairPrompt(trimmed)
    ) {
      return createNewAppNeedsFolder(
        "explicit_restart",
        "Open an empty folder to start over.",
        decisionWithReject,
      );
    }
    if (looksLikeRepairPrompt(trimmed)) {
      return buildLoopRoute(
        "repair_project",
        "repair_keywords",
        "repair",
        decisionWithReject,
      );
    }
    if (looksLikeRefactorPrompt(trimmed)) {
      return buildLoopRoute(
        "refactor_project",
        "refactor_keywords",
        "follow_up",
        decisionWithReject,
      );
    }
    if (looksLikeAuditPrompt(trimmed)) {
      return buildLoopRoute(
        "edit_existing_project",
        "audit_keywords",
        "audit",
        decisionWithReject,
      );
    }
    if (editPhrasing) {
      return buildLoopRoute(
        "edit_existing_project",
        "edit_keywords",
        "follow_up",
        decisionWithReject,
      );
    }
    if (looksLikeGreenfieldNewAppPrompt(trimmed)) {
      return buildLoopRoute(
        "edit_existing_project",
        "existing_project",
        "follow_up",
        decisionWithReject,
      );
    }
    return buildLoopRoute(
      "edit_existing_project",
      "existing_project",
      "follow_up",
      decisionWithReject,
    );
  }

  return blocked(
    'Describe a new app to build (e.g. "Build a product comparison app") or ask me to change something specific.',
    decisionWithReject,
  );
}

/** True when the open folder can scaffold a new app in-place. */
export function canCreateInCurrentFolder(input: {
  scan: ProjectScan | null;
  scanStatus: RouteAgentPromptInput["scanStatus"];
  fallbackSourceFileCount?: number;
}): boolean {
  if (!input.scan && input.scanStatus === "idle") return true;
  return isEmptyProjectFolder(input);
}
