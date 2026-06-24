import { looksLikeGreenfieldNewAppPrompt } from "@/core/agent/agentReadiness";
import { resolveAgentSourceFileCount } from "@/core/agent/agentGreenfieldDispatch";
import { scanHasPackageJson } from "@/core/agent/projectIntentRouting";
import type { ProjectScan } from "@/types";

export const GREENFIELD_PROJECT_BADGE = "GREENFIELD PROJECT";

export interface GreenfieldDetectionResult {
  readonly isGreenfield: boolean;
  readonly folderEmpty: boolean;
  readonly sourceFileCount: number;
  readonly hasPackageJson: boolean;
  readonly reason: string;
}

export function detectGreenfieldProject(input: {
  readonly scan: ProjectScan | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly fallbackSourceFileCount?: number;
  readonly prompt?: string;
}): GreenfieldDetectionResult {
  const sourceFileCount = resolveAgentSourceFileCount(input);

  const folderEmpty = sourceFileCount === 0;
  const hasPackageJson = scanHasPackageJson(input.scan);
  const creationPrompt = input.prompt
    ? looksLikeGreenfieldNewAppPrompt(input.prompt.trim())
    : true;

  if (folderEmpty) {
    return {
      isGreenfield: true,
      folderEmpty: true,
      sourceFileCount,
      hasPackageJson,
      reason: creationPrompt
        ? "empty_folder_creation_prompt"
        : "empty_folder",
    };
  }

  return {
    isGreenfield: false,
    folderEmpty: false,
    sourceFileCount,
    hasPackageJson,
    reason: hasPackageJson ? "has_source_files" : "no_package_json",
  };
}

export function logGreenfieldDetection(
  detection: GreenfieldDetectionResult,
  projectPath?: string | null,
): void {
  console.info(
    [
      "[greenfield:detect]",
      "Greenfield Detection",
      `Folder Empty: ${detection.folderEmpty}`,
      detection.isGreenfield ? "Generation Mode Activated" : "Generation Mode Off",
      `sources=${detection.sourceFileCount}`,
      `packageJson=${detection.hasPackageJson}`,
      `reason=${detection.reason}`,
      projectPath ? `path=${projectPath}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}
