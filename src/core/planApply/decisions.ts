import { computePlanApplyTotals } from "@/core/planApply/stats";
import type { PlanApplySession } from "@/core/planApply/types";

export function hasReviewablePlanApplyFiles(
  session: PlanApplySession | null | undefined,
): boolean {
  if (!session) return false;
  return session.files.some(
    (file) => file.status === "ready" && Boolean(file.diffStats?.changed),
  );
}

/** True only when the user actually has patches to accept or reject. */
export function planApplySessionAwaitsUserReview(
  session: PlanApplySession | null | undefined,
): boolean {
  if (!session) return false;
  if (session.phase !== "review" && session.phase !== "waiting_for_review") {
    return false;
  }
  return hasReviewablePlanApplyFiles(session);
}

/** Approve every ready file with a diff; reject ready files with no diff. */
export function withAllReadyFilesApproved(session: PlanApplySession): PlanApplySession {
  const files = session.files.map((f) =>
    f.status === "ready" && f.diffStats?.changed
      ? { ...f, decision: "approved" as const }
      : f.status === "ready"
        ? { ...f, decision: "rejected" as const }
        : f,
  );
  return { ...session, files, totals: computePlanApplyTotals(files) };
}

/** Approve specific ready files without waiting for a React setState flush. */
export function withRelPathsApproved(
  session: PlanApplySession,
  relPaths: readonly string[],
): PlanApplySession {
  if (relPaths.length === 0) return session;
  const allow = new Set(relPaths);
  const files = session.files.map((f) =>
    allow.has(f.relPath) && f.status === "ready" ? { ...f, decision: "approved" as const } : f,
  );
  return { ...session, files, totals: computePlanApplyTotals(files) };
}

export interface ResolvePlanApplySessionForApplyOptions {
  readonly session?: PlanApplySession;
  readonly approveReadyFiles?: boolean;
  readonly approveRelPaths?: readonly string[];
}

/**
 * Build the session that apply must write. Accept all / per-file accept cannot
 * rely on setState flushing before apply reads host.planApplySession.
 */
export function resolvePlanApplySessionForApply(
  session: PlanApplySession,
  opts?: ResolvePlanApplySessionForApplyOptions,
): PlanApplySession {
  if (opts?.approveReadyFiles) return withAllReadyFilesApproved(session);
  if (opts?.approveRelPaths?.length) {
    return withRelPathsApproved(session, opts.approveRelPaths);
  }
  return session;
}

export function isWritablePlanApplyFile(
  file: PlanApplySession["files"][number],
): boolean {
  return (
    file.status === "ready" &&
    file.basisContent !== undefined &&
    Boolean(file.proposal) &&
    (file.diffStats?.changed || file.proposal!.newContent !== file.basisContent)
  );
}

/** Files Accept all / Apply approved should actually write. */
export function selectWritablePlanApplyFiles(
  session: PlanApplySession,
  opts?: { readonly requireApproved?: boolean },
): PlanApplySession["files"] {
  const writable = session.files.filter(isWritablePlanApplyFile);
  if (opts?.requireApproved === false) return writable;
  const approved = writable.filter((file) => file.decision === "approved");
  return approved.length > 0 ? approved : writable;
}

/** Accept all writes the full proposal, not a partial hunk merge. */
export function applyContentForWrite(
  file: PlanApplySession["files"][number],
  opts?: { readonly useFullProposal?: boolean },
): string {
  if (opts?.useFullProposal) return file.proposal!.newContent;
  return file.appliedNewContent ?? file.proposal!.newContent;
}
