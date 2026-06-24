import type { AIPatchSession } from "@/core/planner/aiTypes";
import type { PlanApplyFileEntry, PlanApplySession } from "@/core/planApply/types";

export type PatchReviewRisk = "low" | "medium" | "high";

export interface AiPatchReviewState {
  readonly relPath: string;
  readonly stale: boolean;
  readonly hasDiff: boolean;
  readonly canApprove: boolean;
  readonly canApply: boolean;
  readonly summary: string | null;
}

export interface PlanApplyFileReview {
  readonly relPath: string;
  readonly action: PlanApplyFileEntry["action"];
  readonly reason: string;
  readonly risk: PatchReviewRisk;
  readonly linesChanged: number;
  readonly status: PlanApplyFileEntry["status"];
  readonly decision: PlanApplyFileEntry["decision"];
  readonly basisContent: string | undefined;
  readonly newContent: string | undefined;
  readonly summary: string | null;
}

export interface PlanApplyReviewState {
  readonly phase: PlanApplySession["phase"];
  readonly prompt: string;
  readonly planSummary: string | null;
  readonly changedFiles: readonly PlanApplyFileReview[];
  readonly totalsLabel: string | null;
  readonly canAcceptAll: boolean;
  readonly canApplyApproved: boolean;
  readonly busy: boolean;
}

export function normalizePatchRisk(linesChanged: number): PatchReviewRisk {
  if (linesChanged > 120) return "high";
  if (linesChanged > 40) return "medium";
  return "low";
}

export function planApplyFileReason(file: PlanApplyFileEntry): string {
  const plan = file.planReason?.trim();
  const selection = file.selectionReason?.trim();
  if (plan && selection && plan !== selection) return `${selection} — ${plan}`;
  return selection || plan || "Selected for this change request";
}

export function deriveAiPatchReviewState(input: {
  readonly session: AIPatchSession;
  readonly currentOnDisk: string;
  readonly approved: boolean;
  readonly applyStatus: string;
}): AiPatchReviewState {
  const proposal = input.session.patch.proposal!;
  const stale = input.currentOnDisk !== input.session.basisContent;
  const hasDiff = proposal.newContent !== input.session.basisContent;
  const canApprove = hasDiff && input.applyStatus !== "applying";
  const canApply =
    input.approved &&
    hasDiff &&
    !stale &&
    input.applyStatus !== "applying" &&
    input.applyStatus !== "applied";

  return {
    relPath: input.session.relPath,
    stale,
    hasDiff,
    canApprove,
    canApply,
    summary: proposal.summary?.trim() || null,
  };
}

export function toPlanApplyFileReview(file: PlanApplyFileEntry): PlanApplyFileReview {
  const linesChanged =
    (file.diffStats?.added ?? 0) + (file.diffStats?.removed ?? 0);
  return {
    relPath: file.relPath,
    action: file.action,
    reason: planApplyFileReason(file),
    risk: normalizePatchRisk(linesChanged),
    linesChanged,
    status: file.status,
    decision: file.decision,
    basisContent: file.basisContent,
    newContent: file.proposal?.newContent,
    summary: file.proposal?.summary?.trim() || null,
  };
}

export function planApplyChangedFiles(
  session: PlanApplySession | null | undefined,
): readonly PlanApplyFileReview[] {
  if (!session) return [];
  return session.files
    .filter((file) => file.status === "ready" && file.diffStats?.changed)
    .map(toPlanApplyFileReview);
}

export function derivePlanApplyReviewState(
  session: PlanApplySession | null | undefined,
): PlanApplyReviewState | null {
  if (!session) return null;

  const busy =
    session.phase === "proposing" ||
    session.phase === "applying" ||
    session.phase === "verifying";

  const changedFiles = planApplyChangedFiles(session);
  const canApplyApproved =
    (session.phase === "review" || session.phase === "waiting_for_review") &&
    session.files.some(
      (file) =>
        file.decision === "approved" &&
        file.status === "ready" &&
        file.diffStats?.changed &&
        file.basisContent !== undefined &&
        file.proposal,
    );

  const totals = session.totals;
  const totalsLabel = totals
    ? `${totals.filesChanged} file${totals.filesChanged === 1 ? "" : "s"} · +${totals.linesAdded} / −${totals.linesRemoved}`
    : null;

  return {
    phase: session.phase,
    prompt: session.prompt,
    planSummary: session.planSummary?.trim() || null,
    changedFiles,
    totalsLabel,
    canAcceptAll:
      (session.phase === "review" || session.phase === "waiting_for_review") &&
      changedFiles.length > 0 &&
      !busy,
    canApplyApproved: canApplyApproved && !busy,
    busy,
  };
}

export function groupPlanApplyFiles(
  files: readonly PlanApplyFileReview[],
): readonly { readonly label: string; readonly files: readonly PlanApplyFileReview[] }[] {
  const created: PlanApplyFileReview[] = [];
  const modified: PlanApplyFileReview[] = [];
  const other: PlanApplyFileReview[] = [];

  for (const file of files) {
    if (file.action === "create") created.push(file);
    else if (file.action === "modify" || file.linesChanged > 0) modified.push(file);
    else other.push(file);
  }

  const groups: { label: string; files: PlanApplyFileReview[] }[] = [];
  if (created.length) groups.push({ label: "New files", files: created });
  if (modified.length) groups.push({ label: "Modified files", files: modified });
  if (other.length) groups.push({ label: "Other changes", files: other });
  return groups;
}
