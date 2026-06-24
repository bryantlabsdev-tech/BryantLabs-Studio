import {
  APPLY_PLAN_PATCH_FORMAT_ERROR,
  parseApplyPlanMarkedFiles,
} from "@/core/planApply/markedFileParse";

/** Mirrors electron runApplyPlanBatchPatch parse + single repair pass. */
export function simulateApplyPlanBatchResponses(
  responses: readonly string[],
  paths: readonly string[],
): {
  readonly final: ReturnType<typeof parseApplyPlanMarkedFiles>;
  readonly repairAttempted: boolean;
  readonly attempts: number;
  readonly lastModelRawText: string | undefined;
} {
  let repairAttempted = false;
  let attempts = 0;
  let last = parseApplyPlanMarkedFiles("", paths);
  let lastRaw: string | undefined;

  for (let i = 0; i < responses.length; i++) {
    attempts += 1;
    const text = responses[i]!;
    lastRaw = text;
    last = parseApplyPlanMarkedFiles(text, paths);
    if (last.ok) {
      return { final: last, repairAttempted, attempts, lastModelRawText: lastRaw };
    }

    const canRepair =
      !repairAttempted &&
      i === 0 &&
      Boolean(text.trim()) &&
      (last.errorCode === APPLY_PLAN_PATCH_FORMAT_ERROR ||
        last.errorCode === "MISSING_FILES");

    if (canRepair) {
      repairAttempted = true;
      continue;
    }
    break;
  }

  return { final: last, repairAttempted, attempts, lastModelRawText: lastRaw };
}
