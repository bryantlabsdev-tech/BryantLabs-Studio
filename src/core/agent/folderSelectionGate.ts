import type { ComposerModeOverride } from "@/core/agent/unifiedAgentRoute";

export type FolderDestination = "start_new" | "open_existing";

export interface FolderSelectionGateState {
  readonly pendingPrompt: string;
}

export interface PendingFolderResume {
  readonly pendingPrompt: string;
  readonly destination: FolderDestination;
}

export type NoProjectSubmitResult =
  | { readonly kind: "show_folder_gate"; readonly pendingPrompt: string }
  | { readonly kind: "continue" };

export interface FolderGateCancelResult {
  readonly prompt: string;
  readonly shouldRun: false;
}

export function shouldInterceptPromptWithoutProject(hasProject: boolean): boolean {
  return !hasProject;
}

export function resolveNoProjectSubmit(input: {
  readonly hasProject: boolean;
  readonly trimmed: string;
}): NoProjectSubmitResult {
  if (input.hasProject) return { kind: "continue" };
  return { kind: "show_folder_gate", pendingPrompt: input.trimmed };
}

export function resolveFolderGateCancel(
  gate: FolderSelectionGateState,
): FolderGateCancelResult {
  return { prompt: gate.pendingPrompt, shouldRun: false };
}

export function shouldResumePendingPrompt(input: {
  readonly pending: PendingFolderResume | null;
  readonly hasProject: boolean;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
}): boolean {
  if (!input.pending || !input.hasProject) return false;
  if (input.pending.destination === "start_new") return true;
  return input.scanStatus === "done" || input.scanStatus === "error";
}

export function resolveResumeModeOverride(
  destination: FolderDestination,
  currentOverride: ComposerModeOverride,
): ComposerModeOverride {
  if (destination === "start_new") return "new_app";
  return currentOverride;
}

export function planPendingFolderResume(input: {
  readonly pending: PendingFolderResume;
  readonly modeOverride: ComposerModeOverride;
}): { readonly prompt: string; readonly modeOverride: ComposerModeOverride } {
  return {
    prompt: input.pending.pendingPrompt,
    modeOverride: resolveResumeModeOverride(
      input.pending.destination,
      input.modeOverride,
    ),
  };
}

/** True when a blocked-reason string is the legacy no-folder error (suppress raw banner). */
export function isNoProjectBlockedReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const lower = reason.toLowerCase();
  return (
    lower.includes("open a project folder") ||
    lower.includes("choose an empty folder") ||
    lower.includes("describe the app you want to build") ||
    lower.includes("no project")
  );
}

export const FOLDER_SELECTION_GATE_COPY = {
  title: "Where should we build this?",
  detail:
    "Pick a folder for a new app or open an existing project — your prompt will run right after.",
  startNewLabel: "Start New Project",
  openExistingLabel: "Open Existing Folder",
  cancelLabel: "Cancel",
} as const;
