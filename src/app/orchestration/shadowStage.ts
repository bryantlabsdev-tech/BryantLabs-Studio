import { readFollowUpShadowApply } from "@/core/build/followUpShadowApply";
import type { PlanApplyFileEntry } from "@/core/planApply/types";
import type { BryantLabsApi } from "@/types";

function effectiveNewContent(file: PlanApplyFileEntry): string | undefined {
  return file.appliedNewContent ?? file.proposal?.newContent;
}

/** Stage ready proposals under `.bryantlabs/shadow-runs/<runId>/` before user promotes. */
export async function stagePlanApplyShadowRun(
  api: BryantLabsApi,
  runId: string,
  files: readonly PlanApplyFileEntry[],
): Promise<{ ok: boolean; reason?: string; staged?: number }> {
  if (!readFollowUpShadowApply()) return { ok: true, staged: 0 };
  const payload = files
    .filter((f) => f.status === "ready")
    .map((f) => {
      const content = effectiveNewContent(f);
      if (!content) return null;
      return { relPath: f.relPath, content };
    })
    .filter((entry): entry is { relPath: string; content: string } => entry != null);
  if (payload.length === 0) return { ok: true, staged: 0 };
  return api.stageShadowRun(runId, payload);
}

export async function discardPlanApplyShadowRun(
  api: BryantLabsApi | undefined,
  runId: string | undefined,
): Promise<void> {
  if (!api || !runId || !readFollowUpShadowApply()) return;
  await api.discardShadowRun(runId).catch(() => undefined);
}
