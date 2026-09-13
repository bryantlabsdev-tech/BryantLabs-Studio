import { buildApplyPlanBatchPatchPrompt } from "@/core/planApply/applyPlanPrompt";
import {
  APPLY_PLAN_PATCH_FORMAT_ERROR,
  normalizeApplyPlanPath,
  parseApplyPlanMarkedFiles,
} from "@/core/planApply/markedFileParse";
import type { ApplyPlanBatchPatchResult } from "@/core/planApply/types";
import type { PatchTargetFile } from "@/core/planner/aiTypes";
import type { PlanContext } from "@/types";
import { geminiGenerateContent } from "./geminiApi";

export interface LiveGeminiPatchConfig {
  readonly apiKey: string;
  readonly model: string;
}

interface ApplyPlanPatchMeta {
  readonly planSummary: string;
  readonly targetPaths: string[];
  readonly repair?: boolean;
  readonly slimContext?: boolean;
  readonly repairMissingPaths?: readonly string[];
  readonly directRewrite?: boolean;
  readonly intelligenceBlock?: string;
  readonly contextNotes?: string;
  readonly uiEditMode?: boolean;
}

function projectHintFromContext(context: PlanContext, slim: boolean): string | undefined {
  if (!slim) return undefined;
  const summary = context.repositorySummary?.trim().slice(0, 400) ?? "";
  return JSON.stringify({
    framework: context.framework,
    language: context.language,
    bundler: context.bundler,
    packageManager: context.packageManager,
    entryPoints: context.entryPoints?.slice(0, 4),
    ...(summary ? { repositorySummary: summary } : {}),
  });
}

function buildPrompt(
  userPrompt: string,
  context: PlanContext,
  files: readonly PatchTargetFile[],
  meta: ApplyPlanPatchMeta & {
    mode: "standard" | "repair" | "directRewrite";
    previousModelOutput?: string;
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
      ? { repairMissingPaths: [...meta.repairMissingPaths] }
      : {}),
    projectHint: projectHintFromContext(context, Boolean(meta.slimContext)),
    ...(intelligenceBlock && !contextNotes ? { intelligenceBlock } : {}),
    ...(contextNotes ? { contextNotes } : {}),
    ...(meta.uiEditMode ? { uiEditMode: true } : {}),
  });
}

/** Live Gemini Apply Plan batch patch (headless benchmark harness). */
export async function liveApplyPlanBatchPatch(
  config: LiveGeminiPatchConfig,
  userPrompt: string,
  context: PlanContext,
  files: readonly PatchTargetFile[],
  meta: ApplyPlanPatchMeta,
): Promise<ApplyPlanBatchPatchResult> {
  const batchFiles = meta.directRewrite ? [...files] : [...files];
  const targetPaths = batchFiles.map((f) => normalizeApplyPlanPath(f.path));

  if (batchFiles.length === 0) {
    return {
      ok: false,
      provider: "gemini",
      model: config.model,
      raw: null,
      latencyMs: 0,
      error: "No files to patch.",
      missingPaths: [],
    };
  }

  let totalLatency = 0;
  let repairAttempted = false;

  async function generateOnce(opts: {
    mode: "standard" | "repair" | "directRewrite";
    previousModelOutput?: string;
    repairMissingPaths?: readonly string[];
    files?: readonly PatchTargetFile[];
  }): Promise<ApplyPlanBatchPatchResult> {
    const activeFiles = opts.files ?? batchFiles;
    const activePaths = activeFiles.map((f) => normalizeApplyPlanPath(f.path));
    const prompt = buildPrompt(userPrompt, context, activeFiles, {
      ...meta,
      targetPaths: activePaths,
      mode: opts.mode,
      directRewrite: opts.mode === "directRewrite",
      ...(opts.previousModelOutput
        ? { previousModelOutput: opts.previousModelOutput }
        : {}),
      ...(opts.repairMissingPaths && opts.repairMissingPaths.length > 0
        ? { repairMissingPaths: opts.repairMissingPaths }
        : {}),
    });
    const maxOutputTokens = activeFiles.length === 1 ? 8192 : 16384;
    const timeoutMs = activeFiles.length === 1 ? 60_000 : 120_000;
    const res = await geminiGenerateContent({
      apiKey: config.apiKey,
      model: config.model,
      prompt,
      maxOutputTokens,
      timeoutMs,
    });
    totalLatency += res.latencyMs;

    if (!res.ok) {
      return {
        ok: false,
        provider: "gemini",
        model: config.model,
        raw: res.raw,
        rawText: res.text,
        latencyMs: totalLatency,
        error: res.error ?? "Provider request failed.",
        missingPaths: activePaths,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
        lastModelRawText: res.text,
      };
    }

    const parsed = parseApplyPlanMarkedFiles(res.text, activePaths);
    const partialOut: Record<string, string> = {};
    for (const p of activePaths) {
      const content = parsed.files.get(p);
      if (content) partialOut[p] = content;
    }
    const partialFiles =
      Object.keys(partialOut).length > 0 ? partialOut : undefined;

    if (parsed.ok) {
      return {
        ok: true,
        provider: "gemini",
        model: config.model,
        raw: res.raw,
        rawText: res.text,
        latencyMs: totalLatency,
        files: partialOut,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
      };
    }

    return {
      ok: false,
      provider: "gemini",
      model: config.model,
      raw: res.raw,
      rawText: res.text,
      latencyMs: totalLatency,
      error: parsed.errorMessage ?? "Could not parse Apply Plan patch response.",
      errorCode: parsed.errorCode ?? APPLY_PLAN_PATCH_FORMAT_ERROR,
      missingPaths: [...parsed.missingPaths],
      files: partialFiles,
      repairAttempted,
      directRewrite: Boolean(meta.directRewrite),
      lastModelRawText: res.text,
    };
  }

  async function generateSequentialPerFile(
    mode: "standard" | "repair" | "directRewrite",
  ): Promise<ApplyPlanBatchPatchResult> {
    const merged: Record<string, string> = {};
    let lastResult: ApplyPlanBatchPatchResult | null = null;
    let lastRaw: string | undefined;
    for (const file of batchFiles) {
      const res = await generateOnce({ mode, files: [file] });
      lastResult = res;
      lastRaw = res.lastModelRawText ?? res.rawText ?? lastRaw;
      if (res.files) Object.assign(merged, res.files);
      if (!res.ok) break;
    }
    const mergedPaths = Object.keys(merged);
    if (mergedPaths.length === targetPaths.length && mergedPaths.length > 0) {
      return {
        ok: true,
        provider: "gemini",
        model: config.model,
        raw: lastResult!.raw,
        rawText: lastResult!.rawText,
        latencyMs: totalLatency,
        files: merged,
        repairAttempted,
        directRewrite: Boolean(meta.directRewrite),
      };
    }
    const missingPaths = targetPaths.filter((p) => merged[p] === undefined);
    return {
      ok: false,
      provider: "gemini",
      model: lastResult?.model ?? config.model,
      raw: lastResult?.raw ?? null,
      rawText: lastResult?.rawText,
      latencyMs: totalLatency,
      error: lastResult?.error ?? "Could not parse Apply Plan patch response.",
      errorCode: lastResult?.errorCode ?? APPLY_PLAN_PATCH_FORMAT_ERROR,
      missingPaths,
      ...(mergedPaths.length > 0 ? { files: merged } : {}),
      repairAttempted,
      directRewrite: Boolean(meta.directRewrite),
      lastModelRawText: lastRaw,
    };
  }

  const initialMode = meta.directRewrite ? "directRewrite" : "standard";
  const first =
    batchFiles.length > 1 && !meta.repair
      ? await generateSequentialPerFile(initialMode)
      : await generateOnce({ mode: initialMode });
  if (first.ok) return first;

  const lastRaw = first.lastModelRawText ?? first.rawText;
  const canRepair =
    !meta.directRewrite &&
    !meta.repair &&
    Boolean(lastRaw?.trim()) &&
    (first.errorCode === APPLY_PLAN_PATCH_FORMAT_ERROR ||
      first.errorCode === "MISSING_FILES");

  if (canRepair) {
    repairAttempted = true;
    const missingForRepair =
      first.errorCode === "MISSING_FILES" && first.missingPaths?.length
        ? [...first.missingPaths]
        : targetPaths;
    const second = await generateOnce({
      mode: "repair",
      previousModelOutput: lastRaw,
      repairMissingPaths: missingForRepair,
    });
    if (second.ok) return { ...second, repairAttempted: true, latencyMs: totalLatency };
    return { ...second, repairAttempted: true, latencyMs: totalLatency };
  }

  return first;
}
