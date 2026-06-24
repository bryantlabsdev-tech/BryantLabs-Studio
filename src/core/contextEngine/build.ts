import { buildApplyPlanBatchPatchPrompt } from "@/core/planApply/applyPlanPrompt";
import { isGameplayPatchTarget } from "@/core/planApply/targetPolicy";
import { normalizeApplyPlanPath } from "@/core/planApply/markedFileParse";
import { buildApplyPlanPatchContext } from "@/core/planner/context";
import type { PlanContext } from "@/core/planner/aiTypes";
import { summarizeLargeFile } from "@/core/providers/requestSize";
import { classifyContextTask } from "@/core/contextEngine/classify";
import {
  extractClassNamesFromSource,
  summarizeAppTsxForContext,
} from "@/core/contextEngine/extractClassNames";
import {
  logContextBuild,
  logContextCompress,
  logContextTokens,
} from "@/core/contextEngine/logging";
import {
  estimateTokens,
  getProviderInputTokenLimit,
} from "@/core/contextEngine/tokenBudget";
import type {
  ContextBuildInput,
  ContextPackage,
  ContextPatchFile,
  TokenBudgetResult,
} from "@/core/contextEngine/types";
import type { AgentStage } from "@/core/providers/orchestration";
import type { ProviderId } from "@/core/providers/types";
import type { ProjectMemory } from "@/core/projectMemory/types";

function compactMemoryFeaturesSummary(
  memory: ProjectMemory | null | undefined,
): string {
  if (!memory) return "";
  const parts = [
    memory.projectName.trim(),
    memory.architecture.trim(),
    memory.userPreferences.trim(),
    memory.notes.trim(),
  ].filter(Boolean);
  return parts.join(" · ").slice(0, 400);
}

function buildContextNotes(opts: {
  uiAuditSummary?: string | null;
  memoryFeaturesSummary?: string;
  appClassNames?: readonly string[];
  includeClassNames?: boolean;
}): string {
  const lines: string[] = [];
  if (opts.includeClassNames && opts.appClassNames && opts.appClassNames.length > 0) {
    lines.push(`App.tsx classes: ${opts.appClassNames.join(", ")}`);
  }
  if (opts.uiAuditSummary?.trim()) {
    lines.push("UI audit:", opts.uiAuditSummary.trim());
  }
  if (opts.memoryFeaturesSummary?.trim()) {
    lines.push("App memory:", opts.memoryFeaturesSummary.trim());
  }
  return lines.join("\n");
}

function buildUiEditPlanContext(scan: import("@/types").ProjectScan): PlanContext {
  return {
    ...buildApplyPlanPatchContext(scan),
    files: [],
    symbols: [],
    dependencies: (scan.dependencies ?? []).slice(0, 8),
  };
}

function patchFilesForPrompt(
  files: readonly ContextPatchFile[],
  uiEditMode: boolean,
  appClassNames: readonly string[],
  summarizeApp: boolean,
): ContextPatchFile[] {
  return files.map((f) => {
    const path = normalizeApplyPlanPath(f.path);
    if (uiEditMode && path === "src/App.tsx" && (summarizeApp || appClassNames.length > 0)) {
      return {
        path: f.path,
        content: summarizeAppTsxForContext(f.content, appClassNames),
      };
    }
    if (path === "src/index.css" && f.content.length > 6000) {
      return { path: f.path, content: summarizeLargeFile(f.content, 4000) };
    }
    return f;
  });
}

function buildPromptPreview(opts: {
  userPrompt: string;
  planSummary: string;
  patchFiles: readonly ContextPatchFile[];
  contextNotes: string;
  directRewrite: boolean;
  uiEditMode: boolean;
  appClassNames: readonly string[];
}): string {
  return buildApplyPlanBatchPatchPrompt({
    userPrompt: opts.userPrompt,
    planSummary: opts.planSummary,
    files: opts.patchFiles.map((f) => ({ path: f.path, content: f.content })),
    mode: opts.directRewrite ? "directRewrite" : "standard",
    ...(opts.uiEditMode
      ? {
          uiEditMode: true,
          appClassNames: [...opts.appClassNames],
        }
      : {}),
    ...(opts.contextNotes.trim() ? { contextNotes: opts.contextNotes.trim() } : {}),
    ...(opts.uiEditMode
      ? {
          projectHint: JSON.stringify({
            scope: "ui_edit",
            files: opts.patchFiles.map((f) => f.path),
          }),
        }
      : {}),
  });
}

export function buildApplyPlanContextPackage(
  input: ContextBuildInput,
): ContextPackage {
  const taskType = input.taskType ?? classifyContextTask(input.userPrompt);
  const uiEditMode = taskType === "ui_edit";
  const gameplayMode = taskType === "gameplay_edit";
  const rawPatchFiles = [...(input.patchFiles ?? [])];
  const appFile = rawPatchFiles.find(
    (f) => normalizeApplyPlanPath(f.path) === "src/App.tsx",
  );
  const appClassNames = appFile
    ? extractClassNamesFromSource(appFile.content)
    : [];

  const patchFiles =
    uiEditMode && !input.directRewrite
      ? rawPatchFiles.filter(
          (f) => normalizeApplyPlanPath(f.path) === "src/index.css",
        )
      : gameplayMode
        ? rawPatchFiles.filter((f) => isGameplayPatchTarget(f.path))
        : rawPatchFiles;

  const planSummary =
    uiEditMode && input.planSummary && input.planSummary.length > 200
      ? input.userPrompt.trim()
      : (input.planSummary?.trim() || input.userPrompt.trim());

  const context: PlanContext = uiEditMode
    ? buildUiEditPlanContext(input.scan)
    : buildApplyPlanPatchContext(input.scan);

  const memoryFeaturesSummary = compactMemoryFeaturesSummary(input.projectMemory);
  const contextNotes =
    uiEditMode || gameplayMode
      ? buildContextNotes({
          ...(input.uiAuditSummary != null ? { uiAuditSummary: input.uiAuditSummary } : {}),
          memoryFeaturesSummary,
          appClassNames,
          includeClassNames: uiEditMode,
        })
      : "";

  const promptFiles = patchFilesForPrompt(
    patchFiles,
    uiEditMode,
    appClassNames,
    uiEditMode && Boolean(input.compressed),
  );

  const includedFiles = promptFiles.map((f) => normalizeApplyPlanPath(f.path));
  logContextBuild(taskType, includedFiles);

  const promptPreview = buildPromptPreview({
    userPrompt: input.userPrompt,
    planSummary,
    patchFiles: promptFiles,
    contextNotes,
    directRewrite: Boolean(input.directRewrite),
    uiEditMode,
    appClassNames,
  });

  const estimatedTokens = estimateTokens(promptPreview);

  return {
    userPrompt: input.userPrompt,
    taskType,
    context,
    patchFiles: promptFiles,
    planSummary,
    intelligenceBlock: "",
    contextNotes,
    slimContext: uiEditMode || gameplayMode || Boolean(input.compressed),
    uiEditMode,
    includedFiles,
    promptPreview,
    estimatedTokens,
    compressed: Boolean(input.compressed),
    appClassNames,
  };
}

export function compressContextPackage(
  pkg: ContextPackage,
  limit: number,
): ContextPackage {
  const before = pkg.estimatedTokens;
  if (before <= limit) return pkg;

  let next: ContextPackage = {
    ...pkg,
    compressed: true,
    slimContext: true,
    intelligenceBlock: "",
  };

  const summarizedFiles = patchFilesForPrompt(
    pkg.patchFiles,
    pkg.uiEditMode,
    pkg.appClassNames,
    true,
  );
  const shortSummary = pkg.planSummary.slice(0, 120);

  next = {
    ...next,
    patchFiles: summarizedFiles,
    planSummary: shortSummary,
    promptPreview: buildPromptPreview({
      userPrompt: pkg.userPrompt,
      planSummary: shortSummary,
      patchFiles: summarizedFiles,
      contextNotes: pkg.contextNotes.split("\n").slice(0, 4).join("\n"),
      directRewrite: false,
      uiEditMode: pkg.uiEditMode,
      appClassNames: pkg.appClassNames,
    }),
  };

  if (estimateTokens(next.promptPreview) > limit && pkg.uiEditMode) {
    const cssOnly = summarizedFiles.filter(
      (f) => normalizeApplyPlanPath(f.path) === "src/index.css",
    );
    next = {
      ...next,
      patchFiles: cssOnly,
      includedFiles: cssOnly.map((f) => normalizeApplyPlanPath(f.path)),
      promptPreview: buildPromptPreview({
        userPrompt: pkg.userPrompt,
        planSummary: shortSummary,
        patchFiles: cssOnly,
        contextNotes: "",
        directRewrite: false,
        uiEditMode: true,
        appClassNames: pkg.appClassNames,
      }),
    };
  } else if (estimateTokens(next.promptPreview) > limit && pkg.taskType === "gameplay_edit") {
    const gameplayFiles = summarizedFiles.filter((f) =>
      isGameplayPatchTarget(f.path),
    );
    next = {
      ...next,
      patchFiles: gameplayFiles,
      includedFiles: gameplayFiles.map((f) => normalizeApplyPlanPath(f.path)),
      promptPreview: buildPromptPreview({
        userPrompt: pkg.userPrompt,
        planSummary: shortSummary,
        patchFiles: gameplayFiles,
        contextNotes: pkg.contextNotes.split("\n").slice(0, 6).join("\n"),
        directRewrite: false,
        uiEditMode: false,
        appClassNames: pkg.appClassNames,
      }),
    };
  }

  const after = estimateTokens(next.promptPreview);
  logContextCompress(before, after, "provider_limit");
  return { ...next, estimatedTokens: after };
}

export function enforceContextTokenBudget(opts: {
  input: ContextBuildInput;
  provider: ProviderId;
  stage: AgentStage;
  userPrompt: string;
}): TokenBudgetResult {
  let pkg = buildApplyPlanContextPackage({
    ...opts.input,
    userPrompt: opts.userPrompt,
  });
  const limit = getProviderInputTokenLimit(opts.provider, opts.stage);
  logContextTokens(pkg.estimatedTokens, limit);

  const actions: string[] = [];
  if (pkg.estimatedTokens > limit) {
    actions.push("compress");
    pkg = compressContextPackage(pkg, limit);
    logContextTokens(pkg.estimatedTokens, limit);
  }

  return {
    package: pkg,
    withinLimit: pkg.estimatedTokens <= limit,
    limit,
    compressionActions: actions,
  };
}

export function buildContextFailureMeta(
  estimatedTokens: number,
  providerLimit: number,
  compressionAttempted: boolean,
): import("@/core/contextEngine/types").ContextFailureMeta {
  return {
    failure_type: "request_too_large",
    estimated_tokens: estimatedTokens,
    provider_limit: providerLimit,
    compression_attempted: compressionAttempted,
  };
}
