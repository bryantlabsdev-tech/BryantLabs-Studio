import { isFallbackSkeletonAppContent } from "@/core/greenfield/fallbackSkeleton";
import { fillMissingGreenfieldFiles } from "@/core/greenfield/fallbackSkeleton";
import {
  GREENFIELD_FILE_PATHS,
  type GeneratedFile,
  type GreenfieldFilePath,
} from "@/core/greenfield/types";

export interface GreenfieldAutoWriteDecision {
  readonly ready: boolean;
  readonly reason: string | null;
  readonly skeletonDetected: boolean;
  readonly completedViaFill: boolean;
  readonly files: readonly (GeneratedFile | import("@/core/greenfield/types").GreenfieldProjectFile)[] | null;
}

function appContent(files: readonly GeneratedFile[]): string | null {
  return files.find((f) => f.path === "src/App.tsx")?.content ?? null;
}

function missingPaths(files: readonly GeneratedFile[]): GreenfieldFilePath[] {
  return GREENFIELD_FILE_PATHS.filter(
    (path) => !files.some((f) => f.path === path && f.content.trim()),
  );
}

/** Decide whether agent auto-write may proceed for parsed or partial greenfield output. */
export function resolveGreenfieldAutoWriteDecision(
  files: readonly (GeneratedFile | import("@/core/greenfield/types").GreenfieldProjectFile)[] | null | undefined,
  userPrompt?: string,
  opts?: {
    readonly generationMode?: import("@/core/greenfield/types").GreenfieldGenerationMode;
    readonly projectFiles?: readonly import("@/core/greenfield/types").GreenfieldProjectFile[];
    readonly manifestPages?: readonly string[];
  },
): GreenfieldAutoWriteDecision {
  if (opts?.generationMode === "multi-phase" && opts.projectFiles?.length) {
    const app = opts.projectFiles.find((f) => f.path === "src/App.tsx")?.content ?? null;
    const skeletonDetected = app != null && isFallbackSkeletonAppContent(app);
    if (skeletonDetected) {
      return {
        ready: false,
        reason:
          "Multi-phase generation produced a placeholder App.tsx. Retry or review files manually.",
        skeletonDetected: true,
        completedViaFill: false,
        files: null,
      };
    }
    const expectedPages = opts.manifestPages?.length ?? 0;
    const pageFiles = opts.projectFiles.filter(
      (f) => f.path.startsWith("src/pages/") && f.content.trim(),
    );
    if (expectedPages > 0 && pageFiles.length < expectedPages) {
      return {
        ready: false,
        reason: `Multi-phase generation missing ${expectedPages - pageFiles.length} page component(s).`,
        skeletonDetected: false,
        completedViaFill: false,
        files: null,
      };
    }
    return {
      ready: true,
      reason: null,
      skeletonDetected: false,
      completedViaFill: false,
      files: opts.projectFiles,
    };
  }

  const liteFiles = files as readonly GeneratedFile[] | null | undefined;
  if (!liteFiles?.length) {
    return {
      ready: false,
      reason: "No generated files.",
      skeletonDetected: false,
      completedViaFill: false,
      files: null,
    };
  }

  const app = appContent(liteFiles);
  const skeletonDetected = app != null && isFallbackSkeletonAppContent(app);
  if (skeletonDetected) {
    return {
      ready: false,
      reason:
        "Generation fell back to a placeholder app shell. Retry with a clearer prompt or review files manually.",
      skeletonDetected: true,
      completedViaFill: false,
      files: liteFiles,
    };
  }

  if (liteFiles.length === GREENFIELD_FILE_PATHS.length) {
    return {
      ready: true,
      reason: null,
      skeletonDetected: false,
      completedViaFill: false,
      files: liteFiles,
    };
  }

  const missing = missingPaths(liteFiles);
  if (missing.length === 0) {
    return {
      ready: true,
      reason: null,
      skeletonDetected: false,
      completedViaFill: false,
      files: liteFiles,
    };
  }

  const filled = fillMissingGreenfieldFiles(liteFiles, missing, userPrompt, {
    allowCriticalSkeleton: true,
  });
  if (filled.files.length !== GREENFIELD_FILE_PATHS.length) {
    return {
      ready: false,
      reason: `Incomplete file set (${liteFiles.length}/${GREENFIELD_FILE_PATHS.length}).`,
      skeletonDetected: false,
      completedViaFill: false,
      files: liteFiles,
    };
  }

  const filledApp = appContent(filled.files);
  const filledSkeleton =
    filledApp != null && isFallbackSkeletonAppContent(filledApp);
  if (filledSkeleton) {
    return {
      ready: false,
      reason:
        "Filled missing files with placeholder content. Review before writing or retry generation.",
      skeletonDetected: true,
      completedViaFill: true,
      files: filled.files,
    };
  }

  return {
    ready: true,
    reason: null,
    skeletonDetected: false,
    completedViaFill: true,
    files: filled.files,
  };
}
