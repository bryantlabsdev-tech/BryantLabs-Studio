import { APPLY_PLAN_PATCH_FORMAT_ERROR } from "@/core/planApply/markedFileParse";
import { CONFIG_UI_BLOCK_MESSAGE } from "@/core/planApply/targetPolicy";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

export const APPLY_PLAN_ZERO_PROPOSALS_MESSAGE =
  "Apply Plan produced zero valid patch proposals.";

/** Root cause when the model omitted @@FILE markers (UI-only apply). */
export function buildApplyPlanPatchFormatRootCause(
  paths: readonly string[],
): string {
  const list =
    paths.length === 0
      ? "target files"
      : paths.length === 1
        ? paths[0]!
        : paths.join(" and ");
  return `Patch format error — AI did not return updated file content for ${list}.`;
}

export interface PlanApplyProposalDiagnostic {
  readonly path: string;
  readonly reason: string;
}

export function classifyPlanApplyProposalReason(
  file: PlanApplyFileEntry,
): string {
  if (file.rejectionReason?.trim()) {
    return file.rejectionReason.trim();
  }

  const err = file.error?.trim() ?? "";

  if (file.status === "skipped") {
    if (err.includes(CONFIG_UI_BLOCK_MESSAGE)) {
      return "Target blocked by UI-only policy";
    }
    if (/not found in project/i.test(err)) {
      return "File not found in project";
    }
    if (/not readable/i.test(err)) {
      return "File not readable";
    }
    if (/character limit/i.test(err)) {
      return "File too large for patch proposal";
    }
    if (/not editable/i.test(err)) {
      return "Target not editable";
    }
    return err || "Target skipped";
  }

  if (file.status === "error") {
    if (/max ai calls reached|budget exceeded|budget remaining/i.test(err)) {
      return err;
    }
    if (/whitespace/i.test(err)) {
      return "Whitespace-only change";
    }
    if (/no changes|identical/i.test(err)) {
      return "No changes produced";
    }
    if (/provider request failed/i.test(err)) {
      return "Model failed";
    }
    if (/patch proposal failed/i.test(err)) {
      return "Model failed";
    }
    if (
      err.includes(APPLY_PLAN_PATCH_FORMAT_ERROR) ||
      /patch format error|@@FILE/i.test(err)
    ) {
      return "Patch format error — missing @@FILE file blocks";
    }
    if (/invalid patch/i.test(err)) {
      return "Invalid patch format";
    }
    if (/failed to read/i.test(err)) {
      return "Failed to read file";
    }
    if (file.patch && !file.patch.ok) {
      return file.patch.error ? `Model failed — ${file.patch.error}` : "Model failed";
    }
    return err || "Model failed";
  }

  if (file.status === "ready") {
    if (file.diffStats && !file.diffStats.changed) {
      return "No changes produced";
    }
    if (file.decision === "rejected" && !file.diffStats?.changed) {
      return "AI returned identical content";
    }
  }

  if (file.status === "pending" || file.status === "proposing") {
    return "Proposal did not complete";
  }

  return err || "No patch produced";
}

export function buildPlanApplyProposalDiagnostics(
  files: readonly PlanApplyFileEntry[],
  collectionSkipped: readonly string[],
  opts?: { omitBlockedCollectionNoise?: boolean },
): PlanApplyProposalDiagnostic[] {
  const out: PlanApplyProposalDiagnostic[] = [];

  for (const f of files) {
    if (f.status === "ready" && f.diffStats?.changed) continue;
    out.push({
      path: f.relPath,
      reason: classifyPlanApplyProposalReason(f),
    });
  }

  for (const msg of collectionSkipped) {
    const path = msg.split(":")[0]?.trim() ?? msg;
    if (out.some((d) => d.path === path)) continue;
    if (
      opts?.omitBlockedCollectionNoise &&
      (msg.includes(CONFIG_UI_BLOCK_MESSAGE) ||
        msg.includes("Not in UI allowlist"))
    ) {
      continue;
    }
    const reason = msg.includes(CONFIG_UI_BLOCK_MESSAGE)
      ? "Target blocked by UI-only policy"
      : msg.includes("Not in UI allowlist")
        ? "Target blocked by UI-only policy"
        : msg;
    out.push({ path, reason });
  }

  return out;
}

/** Per-file Apply Plan diagnostic line for the review UI. */
export function formatPlanApplyFileDiagnosticLine(
  file: PlanApplyFileEntry,
): string | null {
  const parts: string[] = [];

  if (file.selectionReason) {
    parts.push(`Selected: ${file.selectionReason}`);
  }
  if (file.relevanceScore !== undefined) {
    parts.push(`Relevance: ${file.relevanceScore}`);
  }
  if (file.symbolMatches && file.symbolMatches.length > 0) {
    parts.push(`Symbols: ${file.symbolMatches.slice(0, 5).join(", ")}`);
  }

  if (file.patchGenerated) {
    parts.push("Patch generated");
  }

  if (file.status === "ready" && file.diffStats?.changed) {
    parts.push("Patch accepted for review");
  } else if (file.rejectionReason) {
    parts.push(`Patch rejected — ${file.rejectionReason}`);
  } else if (file.status === "error" && file.error) {
    parts.push(`Patch rejected — ${file.error}`);
  } else if (file.status === "skipped") {
    parts.push(`Patch skipped — ${file.error ?? "target excluded"}`);
  } else if (file.status === "proposing") {
    parts.push("Generating patch…");
  } else if (file.status === "pending") {
    parts.push("Awaiting patch proposal");
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatPlanApplyProposalDiagnosticsCopy(
  diagnostics: readonly PlanApplyProposalDiagnostic[],
): string {
  return [
    APPLY_PLAN_ZERO_PROPOSALS_MESSAGE,
    "",
    "Per-file results:",
    ...diagnostics.map((d) => `${d.path}: ${d.reason}`),
  ].join("\n");
}
