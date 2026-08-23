import type { Patch } from "@/core/editor/types";
import type { PlanApplySession } from "@/core/planApply";
import type { AIPatchSession } from "@/core/planner/aiTypes";

export interface EditorPatchReview {
  readonly before: string;
  readonly after: string;
  readonly label: string;
}

export function deriveAiPatchReview(
  session: AIPatchSession | null,
  activePath: string | null,
): EditorPatchReview | null {
  if (!session || activePath !== session.absPath) return null;
  const proposal = session.patch.proposal;
  if (!session.patch.ok || !proposal) return null;
  if (proposal.newContent === session.basisContent) return null;
  return {
    before: session.basisContent,
    after: proposal.newContent,
    label: "AI patch",
  };
}

export function deriveSafeEditPatchReview(
  patch: Patch | null,
  reviewing: boolean,
): EditorPatchReview | null {
  if (!patch || !reviewing) return null;
  if (patch.before === patch.after) return null;
  return {
    before: patch.before,
    after: patch.after,
    label: patch.description,
  };
}

/** Inline review for Apply Plan when the active editor tab matches a ready proposal. */
export function derivePlanApplyPatchReview(
  session: PlanApplySession | null,
  activeAbsPath: string | null,
): EditorPatchReview | null {
  if (!session || !activeAbsPath) return null;
  const file = session.files.find((f) => f.absPath === activeAbsPath);
  if (!file || file.status !== "ready" || !file.proposal || file.decision === "rejected") {
    return null;
  }
  if (file.diffStats && !file.diffStats.changed) return null;
  const before = file.basisContent ?? "";
  const after = file.appliedNewContent ?? file.proposal.newContent;
  if (before === after) return null;
  return {
    before,
    after,
    label: "Plan apply",
  };
}

export function firstPatchChangeLine(before: string, after: string): number {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const limit = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < limit; i += 1) {
    if (beforeLines[i] !== afterLines[i]) {
      return i + 1;
    }
  }
  return 1;
}
