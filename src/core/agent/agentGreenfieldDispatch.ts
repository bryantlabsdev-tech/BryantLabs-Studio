import type { StudioIntentKind } from "@/core/agent/classifyStudioIntent";
import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import { hasProjectScaffoldMarkers } from "@/core/agent/projectIntentRouting";
import { isIncompleteGreenfieldRun } from "@/core/agent/greenfieldRecoveryRouting";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { ProjectScan } from "@/types";

export const GREENFIELD_EMPTY_FOLDER_ACTIVITY =
  "Detected empty folder — starting new app generation.";

export const NO_FOLDER_GREENFIELD_MESSAGE =
  "Choose an empty folder to create a new app.";

export const NON_EMPTY_FOLDER_GREENFIELD_MESSAGE =
  "This folder is not empty. Choose a new folder or ask me to improve this project.";

export interface AgentIntentDiagnostics {
  readonly prompt: string;
  readonly intent: StudioIntentKind;
  readonly sourceFileCount: number;
  readonly scanStatus: string;
  readonly folderPathPresent: boolean;
  readonly reason: string | null;
}

export function buildGreenfieldFallbackSourceFileCount(
  greenfieldRun: GreenfieldRunSnapshot,
  projectPath: string | undefined,
  scan?: ProjectScan | null,
): number | undefined {
  if (greenfieldRun.filesWritten.length === 0 || !projectPath) return undefined;

  if (isIncompleteGreenfieldRun(greenfieldRun)) {
    return undefined;
  }

  const pathMatches =
    greenfieldRun.targetFolder === projectPath ||
    greenfieldRun.projectPath === projectPath;

  const scaffoldFromWritten = hasProjectScaffoldMarkers(null, greenfieldRun.filesWritten);
  const successfulRunWithFiles =
    greenfieldRun.runResult === "success" && greenfieldRun.filesWritten.length > 0;

  if (pathMatches || scaffoldFromWritten || successfulRunWithFiles) {
    return greenfieldRun.filesWritten.length;
  }

  if (hasProjectScaffoldMarkers(scan ?? null, greenfieldRun.filesWritten)) {
    return greenfieldRun.filesWritten.length;
  }

  return undefined;
}

export function resolveAgentSourceFileCount(input: {
  scan: ProjectScan | null;
  scanStatus: "idle" | "scanning" | "done" | "error";
  fallbackSourceFileCount?: number;
}): number {
  const scanned = input.scan ? countProjectSourceFiles(input.scan) : 0;
  const fallback = input.fallbackSourceFileCount ?? 0;
  return Math.max(scanned, fallback);
}

export function isEmptyProjectFolder(input: {
  scan: ProjectScan | null;
  scanStatus: "idle" | "scanning" | "done" | "error";
  fallbackSourceFileCount?: number;
}): boolean {
  return resolveAgentSourceFileCount(input) === 0;
}

export function buildAgentIntentDiagnostics(input: {
  prompt: string;
  intent: StudioIntentKind;
  reason: string | null;
  projectPath: string | undefined;
  scan: ProjectScan | null;
  scanStatus: "idle" | "scanning" | "done" | "error";
  fallbackSourceFileCount?: number;
}): AgentIntentDiagnostics {
  return {
    prompt: input.prompt,
    intent: input.intent,
    sourceFileCount: resolveAgentSourceFileCount(input),
    scanStatus: input.scanStatus,
    folderPathPresent: Boolean(input.projectPath),
    reason: input.reason,
  };
}

export function formatAgentIntentDiagnostics(d: AgentIntentDiagnostics): string {
  return [
    `intent=${d.intent}`,
    `sources=${d.sourceFileCount}`,
    `scan=${d.scanStatus}`,
    `folder=${d.folderPathPresent ? "yes" : "no"}`,
    d.reason ? `reason=${d.reason}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
