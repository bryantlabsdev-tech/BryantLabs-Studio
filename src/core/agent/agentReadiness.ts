import type { RepositoryIndex } from "@/core/repository/types";
import { isConfigArtifactPath } from "@/core/repository/config";
import type { ProjectScan } from "@/types";

export const NO_PROJECT_FILES_MESSAGE =
  "No project files found. Use New App generation or create/open a project first.";

export const GREENFIELD_ROUTE_MESSAGE =
  "This folder has no app source yet. Use the New App tab to generate a project from your prompt.";

export type AgentScanStatus = "idle" | "scanning" | "done" | "error";

const SOURCE_FILE_RE = /\.(tsx?|jsx?|vue|svelte|css|scss|less)$/i;

const GREENFIELD_PROMPT_PATTERNS: readonly RegExp[] = [
  /\b(create|build|make|generate|scaffold|start)\b[\s\S]{0,48}\b(app|application|project|game|website|site|tool|dashboard)\b/i,
  /\b(create|build|make)\b[\s\S]{0,48}\b(sudoku|calculator|todo|dashboard|timer|chat)\b/i,
  /\bnew\s+(app|application|project|game)\b/i,
  /\bfrom\s+scratch\b/i,
  /\bgreenfield\b/i,
  /\bempty\s+folder\b/i,
];

/** Count likely editable source files (excludes package/tsconfig tooling paths). */
export function countProjectSourceFiles(scan: ProjectScan | null): number {
  if (!scan) return 0;
  return scan.files.filter(
    (f) =>
      typeof f.path === "string" &&
      f.path.length > 0 &&
      SOURCE_FILE_RE.test(f.path) &&
      !isConfigArtifactPath(f.path),
  ).length;
}

export function hasIndexedProjectFiles(scan: ProjectScan | null): boolean {
  return (scan?.files.length ?? 0) > 0;
}

export function isRepositoryIndexReady(
  scan: ProjectScan | null,
  scanStatus: AgentScanStatus,
  repository: RepositoryIndex | null,
): boolean {
  if (!scan || scanStatus !== "done") return false;
  return repository !== null && hasIndexedProjectFiles(scan);
}

export function looksLikeGreenfieldNewAppPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return GREENFIELD_PROMPT_PATTERNS.some((re) => re.test(trimmed));
}

export interface AgentStartGateInput {
  readonly projectOpen: boolean;
  readonly scan: ProjectScan | null;
  readonly scanStatus: AgentScanStatus;
  readonly repository: RepositoryIndex | null;
  readonly goalPrompt: string;
}

export interface AgentStartGateResult {
  readonly blocked: boolean;
  readonly reason: string | null;
  readonly suggestGreenfield: boolean;
}

/** Whether Start Agent should be disabled (ignores prompt length). */
export function getAgentStartDisabledState(
  input: Omit<AgentStartGateInput, "goalPrompt">,
): AgentStartGateResult {
  if (!input.projectOpen) {
    return { blocked: true, reason: "Open a project first.", suggestGreenfield: false };
  }
  if (input.scanStatus === "scanning") {
    return {
      blocked: true,
      reason: "Waiting for project scan to finish…",
      suggestGreenfield: false,
    };
  }
  if (input.scanStatus === "error") {
    return {
      blocked: true,
      reason: "Project scan failed. Try rescanning from the project menu.",
      suggestGreenfield: false,
    };
  }
  if (!input.scan || input.scanStatus !== "done") {
    return {
      blocked: true,
      reason: "Waiting for project scan to finish…",
      suggestGreenfield: false,
    };
  }
  if (!isRepositoryIndexReady(input.scan, input.scanStatus, input.repository)) {
    if (!hasIndexedProjectFiles(input.scan)) {
      return {
        blocked: true,
        reason: NO_PROJECT_FILES_MESSAGE,
        suggestGreenfield: false,
      };
    }
    return {
      blocked: true,
      reason: "Repository index is not ready yet.",
      suggestGreenfield: false,
    };
  }
  if (countProjectSourceFiles(input.scan) === 0) {
    return {
      blocked: true,
      reason: NO_PROJECT_FILES_MESSAGE,
      suggestGreenfield: false,
    };
  }
  return { blocked: false, reason: null, suggestGreenfield: false };
}

function projectHasNoAgentSources(scan: ProjectScan | null): boolean {
  if (!scan) return true;
  return !hasIndexedProjectFiles(scan) || countProjectSourceFiles(scan) === 0;
}

/** Full gate including prompt-specific greenfield routing. */
export function getAgentStartGate(input: AgentStartGateInput): AgentStartGateResult {
  if (!input.projectOpen) {
    return { blocked: true, reason: "Open a project first.", suggestGreenfield: false };
  }
  if (input.scanStatus === "scanning") {
    return {
      blocked: true,
      reason: "Waiting for project scan to finish…",
      suggestGreenfield: false,
    };
  }
  if (input.scanStatus === "error") {
    return {
      blocked: true,
      reason: "Project scan failed. Try rescanning from the project menu.",
      suggestGreenfield: false,
    };
  }
  if (!input.scan || input.scanStatus !== "done") {
    return {
      blocked: true,
      reason: "Waiting for project scan to finish…",
      suggestGreenfield: false,
    };
  }

  const trimmed = input.goalPrompt.trim();
  if (trimmed.length < 4) {
    return {
      blocked: true,
      reason: "Enter a goal with at least 4 characters.",
      suggestGreenfield: false,
    };
  }

  if (projectHasNoAgentSources(input.scan)) {
    if (looksLikeGreenfieldNewAppPrompt(trimmed)) {
      return {
        blocked: true,
        reason: GREENFIELD_ROUTE_MESSAGE,
        suggestGreenfield: true,
      };
    }
    return {
      blocked: true,
      reason: NO_PROJECT_FILES_MESSAGE,
      suggestGreenfield: false,
    };
  }

  if (!isRepositoryIndexReady(input.scan, input.scanStatus, input.repository)) {
    return {
      blocked: true,
      reason: "Repository index is not ready yet.",
      suggestGreenfield: false,
    };
  }

  return { blocked: false, reason: null, suggestGreenfield: false };
}
