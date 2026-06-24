import { evaluateRequirementChecklist } from "@/core/agent/requirementVerification";
import { freezePlanApplyFileDiffs } from "@/core/agent/runFileDiffs";
import type { PlanApplyFileEntry } from "@/core/planApply/types";
import type { ProjectScan } from "@/types";

export interface PostApplyRequirementSummary {
  readonly allSatisfied: boolean;
  readonly failedLabels: readonly string[];
  readonly advisoryNote: string | null;
}

function diffsFromAppliedFiles(
  files: readonly PlanApplyFileEntry[],
  appliedPaths: readonly string[],
) {
  return freezePlanApplyFileDiffs(files, appliedPaths);
}

/** Evaluate prompt requirements against applied file diffs (non-blocking advisory). */
export function summarizePostApplyRequirements(input: {
  readonly prompt: string;
  readonly files: readonly PlanApplyFileEntry[];
  readonly appliedPaths: readonly string[];
  readonly scan?: ProjectScan | null;
  readonly buildPassed?: boolean;
}): PostApplyRequirementSummary {
  const fileDiffs = diffsFromAppliedFiles(input.files, input.appliedPaths);
  const result = evaluateRequirementChecklist({
    prompt: input.prompt,
    fileDiffs,
    scan: input.scan ?? null,
    buildPassed: input.buildPassed ?? false,
  });
  const failed = result.items.filter(
    (item) => item.detected && !item.advisory && item.status === "fail",
  );
  const failedLabels = failed.map((item) => item.label);
  const advisoryNote =
    failedLabels.length > 0
      ? `Some prompt requirements may be incomplete: ${failedLabels.slice(0, 4).join("; ")}${failedLabels.length > 4 ? "…" : ""}`
      : !result.allSatisfied && result.items.some((i) => i.status === "unknown")
        ? "Some requirements could not be verified automatically — review the Run Inspector checklist."
        : null;
  return {
    allSatisfied: result.allSatisfied,
    failedLabels,
    advisoryNote,
  };
}
