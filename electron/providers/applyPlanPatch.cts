import type { PlanContext } from "./aiPlan.cjs";
import type { PatchSymbol, PatchTargetFile } from "./aiPatch.cjs";
import {
  buildApplyPlanBatchPatchPrompt,
  type ApplyPlanPromptMode,
} from "./applyPlanPrompt.cjs";
import {
  normalizeApplyPlanPath,
  parseApplyPlanMarkedFiles,
  type ApplyPlanParseErrorCode,
} from "./markedFileParse.cjs";

export interface ApplyPlanBatchPatchMeta {
  planSummary: string;
  targetPaths: string[];
  repair?: boolean;
  slimContext?: boolean;
  repairMissingPaths?: string[];
  directRewrite?: boolean;
  intelligenceBlock?: string;
  contextNotes?: string;
  uiEditMode?: boolean;
}

export type { ApplyPlanPromptMode };

function projectHintFromContext(
  context: PlanContext,
  slim: boolean,
): string | undefined {
  if (!slim) return undefined;
  return JSON.stringify({
    framework: context.framework,
    language: context.language,
    bundler: context.bundler,
    packageManager: context.packageManager,
    entryPoints: context.entryPoints,
    repositorySummary: context.repositorySummary,
  });
}

export function buildApplyPlanBatchPatchPromptFromMeta(
  userPrompt: string,
  context: PlanContext,
  files: readonly PatchTargetFile[],
  meta: ApplyPlanBatchPatchMeta & {
    mode: ApplyPlanPromptMode;
    previousModelOutput?: string;
    intelligenceBlock?: string;
  },
): string {
  const mode = meta.directRewrite ? "directRewrite" : meta.mode;
  const intelligenceBlock =
    meta.intelligenceBlock?.trim() ||
    (typeof context.projectIntelligenceSummary === "string"
      ? context.projectIntelligenceSummary
      : undefined);
  const contextNotes = meta.contextNotes?.trim();
  return buildApplyPlanBatchPatchPrompt({
    userPrompt,
    planSummary: meta.planSummary,
    files: files.map((f) => ({ path: f.path, content: f.content })),
    mode,
    ...(meta.previousModelOutput
      ? { previousModelOutput: meta.previousModelOutput }
      : {}),
    ...(meta.repairMissingPaths && meta.repairMissingPaths.length > 0
      ? { repairMissingPaths: meta.repairMissingPaths }
      : {}),
    projectHint: projectHintFromContext(context, Boolean(meta.slimContext)),
    ...(intelligenceBlock && !contextNotes ? { intelligenceBlock } : {}),
    ...(contextNotes ? { contextNotes } : {}),
    ...(meta.uiEditMode ? { uiEditMode: true } : {}),
  });
}

/** Legacy single-file Apply Plan prompt using @@FILE markers for that path only. */
export function buildApplyPlanSingleFilePatchPrompt(
  userPrompt: string,
  context: PlanContext,
  file: PatchTargetFile,
  symbols: PatchSymbol[],
  planMeta: { planSummary: string; fileReason: string },
): string {
  const path = normalizeApplyPlanPath(file.path);
  const symbolList =
    symbols.length > 0
      ? symbols.map((s) => `${s.kind} ${s.name}`).join(", ")
      : "none";
  return [
    "You are applying an approved modification PLAN to a SINGLE file.",
    "Implement the user request using the plan reasoning below.",
    "",
    "OUTPUT CONTRACT (strict):",
    "- Return ONLY the markers below with the complete updated file.",
    "- No markdown fences. No prose. No JSON. No diffs.",
    "",
    `@@FILE:${path}@@`,
    "<full updated file content>",
    `@@END:${path}@@`,
    "",
    "Plan summary:",
    planMeta.planSummary,
    "",
    "Why this file is in the plan:",
    planMeta.fileReason,
    "",
    "User request:",
    userPrompt,
    "",
    `Target file: ${path}`,
    `Relevant symbols: ${symbolList}`,
    "",
    "Project context (JSON):",
    JSON.stringify(context),
    "",
    "Current file content:",
    "--- CURRENT FILE BEGIN ---",
    file.content,
    "--- CURRENT FILE END ---",
  ].join("\n");
}

export function parseApplyPlanBatchPatchResponse(
  text: string,
  expectedPaths: readonly string[],
): {
  ok: boolean;
  files: Map<string, string>;
  errorCode?: ApplyPlanParseErrorCode;
  errorMessage?: string;
  missingPaths: string[];
} {
  const parsed = parseApplyPlanMarkedFiles(text, expectedPaths);
  return {
    ok: parsed.ok,
    files: new Map(parsed.files),
    ...(parsed.errorCode ? { errorCode: parsed.errorCode } : {}),
    ...(parsed.errorMessage ? { errorMessage: parsed.errorMessage } : {}),
    missingPaths: [...parsed.missingPaths],
  };
}
