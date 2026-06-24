import { computePlanApplyTotals } from "@/core/planApply/stats";
import type { PlanApplySession } from "@/core/planApply/types";

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
