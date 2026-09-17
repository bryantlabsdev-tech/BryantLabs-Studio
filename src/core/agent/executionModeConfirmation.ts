import {
  looksLikeExplicitGreenfieldRestart,
  looksLikePreserveExistingAppPrompt,
} from "@/core/agent/agentPromptPatterns";
import {
  looksLikeExplicitNewAppRequest,
  type AgentExecutionKind,
  type RouteAgentPromptResult,
} from "@/core/agent/unifiedAgentRoute";
import {
  inspectWorkspaceProjectProfile,
  profileSignature,
  suggestSiblingProjectFolder,
  type InspectWorkspaceProjectProfileInput,
  type WorkspaceProjectProfile,
} from "@/core/agent/workspaceProjectProfile";

export type ExecutionModeChoice = "edit_current" | "create_new";

export type ExecutionModeLabel =
  | "follow_up_edit"
  | "greenfield"
  | "greenfield_recovery"
  | "ambiguous";

export interface ExecutionModeDiagnostics {
  readonly mode: ExecutionModeLabel;
  readonly reason: string;
  readonly confirmationRequired: boolean;
  readonly userChoice: ExecutionModeChoice | null;
  readonly recommendedChoice: ExecutionModeChoice;
  readonly workspaceLabel: string;
  readonly applicationLabel: string | null;
  readonly profileSignature: string;
  readonly createTargetFolder: string | null;
}

export interface ExecutionModeResolution {
  readonly diagnostics: ExecutionModeDiagnostics;
  readonly profile: WorkspaceProjectProfile;
  readonly confirmationRequired: boolean;
  readonly recommendedChoice: ExecutionModeChoice;
  readonly createTargetFolder: string | null;
}

export interface ResolveExecutionModeInput extends InspectWorkspaceProjectProfileInput {
  readonly route: RouteAgentPromptResult;
  readonly prompt: string;
  readonly modeOverride?: import("@/core/agent/unifiedAgentRoute").ComposerModeOverride;
  readonly skipConfirmation?: boolean;
}

const SESSION_STORAGE_KEY = "bryantlabs.execution-mode.session";

export const EXECUTION_MODE_LOG_LABEL = "Execution mode resolved";

interface ExecutionModeSessionState {
  readonly consecutiveEdit: number;
  readonly consecutiveGreenfield: number;
  readonly lastProfileSignature: string | null;
}

function loadSessionState(): ExecutionModeSessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return { consecutiveEdit: 0, consecutiveGreenfield: 0, lastProfileSignature: null };
    }
    const parsed = JSON.parse(raw) as Partial<ExecutionModeSessionState>;
    return {
      consecutiveEdit:
        typeof parsed.consecutiveEdit === "number" ? parsed.consecutiveEdit : 0,
      consecutiveGreenfield:
        typeof parsed.consecutiveGreenfield === "number"
          ? parsed.consecutiveGreenfield
          : 0,
      lastProfileSignature:
        typeof parsed.lastProfileSignature === "string"
          ? parsed.lastProfileSignature
          : null,
    };
  } catch {
    return { consecutiveEdit: 0, consecutiveGreenfield: 0, lastProfileSignature: null };
  }
}

function saveSessionState(state: ExecutionModeSessionState): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function recordExecutionModeSessionChoice(
  choice: ExecutionModeChoice,
  profile: WorkspaceProjectProfile,
): void {
  const sig = profileSignature(profile);
  const prev = loadSessionState();
  if (choice === "edit_current") {
    saveSessionState({
      consecutiveEdit:
        prev.lastProfileSignature === sig ? prev.consecutiveEdit + 1 : 1,
      consecutiveGreenfield: 0,
      lastProfileSignature: sig,
    });
    return;
  }
  saveSessionState({
    consecutiveEdit: 0,
    consecutiveGreenfield:
      prev.lastProfileSignature === sig ? prev.consecutiveGreenfield + 1 : 1,
    lastProfileSignature: sig,
  });
}

function shouldSkipConfirmation(
  resolution: ExecutionModeResolution,
  session: ExecutionModeSessionState,
): boolean {
  if (!resolution.confirmationRequired) return true;
  const sig = profileSignature(resolution.profile);
  if (session.lastProfileSignature !== sig) return false;
  if (
    resolution.recommendedChoice === "edit_current" &&
    session.consecutiveEdit >= 2
  ) {
    return true;
  }
  if (
    resolution.recommendedChoice === "create_new" &&
    session.consecutiveGreenfield >= 2
  ) {
    return true;
  }
  return false;
}

function routeWantsGreenfield(execution: AgentExecutionKind): boolean {
  return execution === "greenfield" || execution === "greenfield_recovery";
}

function explicitNewAppIntent(
  prompt: string,
  modeOverride: ResolveExecutionModeInput["modeOverride"],
): boolean {
  return (
    modeOverride === "new_app" ||
    looksLikeExplicitNewAppRequest(prompt) ||
    looksLikeExplicitGreenfieldRestart(prompt)
  );
}

function buildDiagnostics(
  mode: ExecutionModeLabel,
  reason: string,
  confirmationRequired: boolean,
  recommendedChoice: ExecutionModeChoice,
  profile: WorkspaceProjectProfile,
  userChoice: ExecutionModeChoice | null,
  createTargetFolder: string | null,
): ExecutionModeDiagnostics {
  return {
    mode,
    reason,
    confirmationRequired,
    userChoice,
    recommendedChoice,
    workspaceLabel: profile.workspaceLabel,
    applicationLabel: profile.applicationLabel,
    profileSignature: profileSignature(profile),
    createTargetFolder,
  };
}

export function resolveExecutionMode(
  input: ResolveExecutionModeInput,
): ExecutionModeResolution {
  const profile = inspectWorkspaceProjectProfile(input);
  const createTargetFolder =
    suggestSiblingProjectFolder(input.projectPath) ?? input.projectPath;
  const route = input.route;

  if (
    route.execution === "consultation" ||
    route.execution === "mixed_confirm" ||
    route.execution === "run_command"
  ) {
    return {
      profile,
      recommendedChoice: "edit_current",
      createTargetFolder: input.projectPath,
      confirmationRequired: false,
      diagnostics: buildDiagnostics(
        "follow_up_edit",
        "Consultation — no file edits.",
        false,
        "edit_current",
        profile,
        "edit_current",
        input.projectPath,
      ),
    };
  }

  const explicitNewApp = explicitNewAppIntent(input.prompt, input.modeOverride);
  const wantsGreenfield = routeWantsGreenfield(route.execution);

  // Existing application — default to follow-up edit; never silent greenfield.
  if (profile.isExistingApplication) {
    if (explicitNewApp || (wantsGreenfield && route.execution !== "greenfield_recovery")) {
      const resolution: ExecutionModeResolution = {
        profile,
        recommendedChoice: "edit_current",
        createTargetFolder,
        confirmationRequired: true,
        diagnostics: buildDiagnostics(
          "ambiguous",
          profile.applicationLabel
            ? `Existing ${profile.applicationLabel} detected.`
            : "Existing application source files detected.",
          true,
          "edit_current",
          profile,
          null,
          createTargetFolder,
        ),
      };
      const skip =
        !explicitNewApp && shouldSkipConfirmation(resolution, loadSessionState());
      if (!input.skipConfirmation && !skip) {
        return resolution;
      }
      return {
        ...resolution,
        confirmationRequired: false,
        diagnostics: buildDiagnostics(
          "follow_up_edit",
          profile.applicationLabel
            ? `Existing ${profile.applicationLabel} detected.`
            : "Existing application source files detected.",
          false,
          "edit_current",
          profile,
          "edit_current",
          input.projectPath,
        ),
      };
    }

    return {
      profile,
      recommendedChoice: "edit_current",
      createTargetFolder: input.projectPath,
      confirmationRequired: false,
      diagnostics: buildDiagnostics(
        route.execution === "greenfield_recovery" ? "greenfield_recovery" : "follow_up_edit",
        profile.applicationLabel
          ? `Existing ${profile.applicationLabel} detected.`
          : "Existing application source files detected.",
        false,
        "edit_current",
        profile,
        "edit_current",
        input.projectPath,
      ),
    };
  }

  // Empty workspace — greenfield default; confirm when prompt conflicts with empty state.
  if (profile.isEmptyWorkspace) {
    const promptConflictsWithEmptyWorkspace = looksLikePreserveExistingAppPrompt(
      input.prompt,
    );
    if (wantsGreenfield && promptConflictsWithEmptyWorkspace) {
      const ambiguous: ExecutionModeResolution = {
        profile,
        recommendedChoice: "create_new",
        createTargetFolder: input.projectPath,
        confirmationRequired: true,
        diagnostics: buildDiagnostics(
          "ambiguous",
          "Workspace contains no source files, but the prompt references an existing application.",
          true,
          "create_new",
          profile,
          null,
          input.projectPath,
        ),
      };
      if (!input.skipConfirmation && !shouldSkipConfirmation(ambiguous, loadSessionState())) {
        return ambiguous;
      }
    }

    const mode: ExecutionModeLabel =
      route.execution === "greenfield_recovery" ? "greenfield_recovery" : "greenfield";
    return {
      profile,
      recommendedChoice: "create_new",
      createTargetFolder: input.projectPath,
      confirmationRequired: false,
      diagnostics: buildDiagnostics(
        mode,
        "Workspace contains no source files.",
        false,
        "create_new",
        profile,
        "create_new",
        input.projectPath,
      ),
    };
  }

  // Partial scaffold (e.g. package.json only) — confirm when route disagrees with structure.
  if (wantsGreenfield && profile.hasPackageJson && !profile.hasAppEntry) {
    const resolution: ExecutionModeResolution = {
      profile,
      recommendedChoice: "create_new",
      createTargetFolder: input.projectPath,
      confirmationRequired: true,
      diagnostics: buildDiagnostics(
        "ambiguous",
        "Project scaffold detected without application entry files.",
        true,
        "create_new",
        profile,
        null,
        input.projectPath,
      ),
    };
    if (!input.skipConfirmation && !shouldSkipConfirmation(resolution, loadSessionState())) {
      return resolution;
    }
  }

  const mode: ExecutionModeLabel = wantsGreenfield
    ? route.execution === "greenfield_recovery"
      ? "greenfield_recovery"
      : "greenfield"
    : "follow_up_edit";
  return {
    profile,
    recommendedChoice: wantsGreenfield ? "create_new" : "edit_current",
    createTargetFolder: input.projectPath,
    confirmationRequired: false,
    diagnostics: buildDiagnostics(
      mode,
      wantsGreenfield
        ? "Workspace routed to new app generation."
        : "Workspace routed to follow-up edit.",
      false,
      wantsGreenfield ? "create_new" : "edit_current",
      profile,
      wantsGreenfield ? "create_new" : "edit_current",
      input.projectPath,
    ),
  };
}

export function routeAfterExecutionMode(
  route: RouteAgentPromptResult,
  diagnostics: ExecutionModeDiagnostics,
): RouteAgentPromptResult {
  const choice = diagnostics.userChoice ?? diagnostics.recommendedChoice;
  if (choice === "edit_current") {
    if (route.execution === "build_loop" || route.execution === "greenfield_recovery") {
      return route;
    }
    return applyExecutionModeChoice(route, "edit_current", diagnostics.createTargetFolder);
  }
  if (route.execution === "greenfield" || route.execution === "greenfield_recovery") {
    return route;
  }
  return applyExecutionModeChoice(route, "create_new", diagnostics.createTargetFolder);
}

export function applyExecutionModeChoice(
  route: RouteAgentPromptResult,
  choice: ExecutionModeChoice,
  _createTargetFolder: string | null,
): RouteAgentPromptResult {
  if (choice === "edit_current") {
    return {
      ...route,
      mode: "edit_existing_project",
      execution: "build_loop",
      intent: "follow_up",
      blockedReason: null,
      activityNote: null,
      needsEmptyFolder: false,
      decision: {
        ...route.decision,
        selectedRoute: "build_loop",
        selectionReason: "execution_mode_edit_confirmed",
        greenfieldRejected: true,
        greenfieldRejectReason: "execution_mode_user_edit",
      },
    };
  }

  return {
    ...route,
    mode: "create_new_app",
    execution: "greenfield",
    intent: "greenfield",
    blockedReason: null,
    activityNote: null,
    needsEmptyFolder: false,
    decision: {
      ...route.decision,
      selectedRoute: "greenfield",
      selectionReason: "execution_mode_greenfield_confirmed",
      greenfieldRejected: false,
      greenfieldRejectReason: null,
    },
  };
}

export function finalizeExecutionModeDiagnostics(
  diagnostics: ExecutionModeDiagnostics,
  choice: ExecutionModeChoice,
  confirmationShown: boolean,
  createTargetFolder: string | null,
): ExecutionModeDiagnostics {
  const mode: ExecutionModeLabel =
    choice === "edit_current"
      ? "follow_up_edit"
      : diagnostics.mode === "greenfield_recovery"
        ? "greenfield_recovery"
        : "greenfield";
  return {
    ...diagnostics,
    mode: confirmationShown && diagnostics.mode === "ambiguous" ? "ambiguous" : mode,
    userChoice: choice,
    confirmationRequired: confirmationShown,
    recommendedChoice: diagnostics.recommendedChoice,
    createTargetFolder,
  };
}

export function formatExecutionModeLogDetails(
  diagnostics: ExecutionModeDiagnostics,
): string {
  const lines = [
    `Execution Mode: ${formatExecutionModeLabel(diagnostics.mode)}`,
    `Reason: ${diagnostics.reason}`,
    `Confirmation Required: ${diagnostics.confirmationRequired ? "true" : "false"}`,
    `Recommended: ${diagnostics.recommendedChoice === "edit_current" ? "Edit Current Project" : "Create New App"}`,
    `Workspace: ${diagnostics.workspaceLabel}`,
  ];
  if (diagnostics.applicationLabel) {
    lines.push(`Application: ${diagnostics.applicationLabel}`);
  }
  if (diagnostics.userChoice) {
    lines.push(
      `User selected: ${diagnostics.userChoice === "edit_current" ? "Edit Current Project" : "Create New App"}`,
    );
  }
  if (diagnostics.createTargetFolder) {
    lines.push(`Target folder: ${diagnostics.createTargetFolder}`);
  }
  return lines.join("\n");
}

export function formatExecutionModeLabel(mode: ExecutionModeLabel): string {
  switch (mode) {
    case "follow_up_edit":
      return "Follow-up Edit";
    case "greenfield":
      return "Greenfield";
    case "greenfield_recovery":
      return "Greenfield Recovery";
    case "ambiguous":
      return "Ambiguous";
  }
}

export function executionModeGenerationMode(
  diagnostics: ExecutionModeDiagnostics | null | undefined,
): string | null {
  if (!diagnostics) return null;
  if (diagnostics.userChoice === "edit_current") return "follow_up_edit";
  if (diagnostics.userChoice === "create_new") {
    return diagnostics.mode === "greenfield_recovery" ? "greenfield_recovery" : "greenfield";
  }
  return diagnostics.mode === "follow_up_edit"
    ? "follow_up_edit"
    : diagnostics.mode === "greenfield_recovery"
      ? "greenfield_recovery"
      : diagnostics.mode === "greenfield"
        ? "greenfield"
        : null;
}
