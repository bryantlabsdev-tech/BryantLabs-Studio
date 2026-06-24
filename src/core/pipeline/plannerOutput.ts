import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { PlannerOutput } from "@/core/pipeline/types";

/** Map AI Plan result into structured planner agent output. */
export function plannerOutputFromAiPlan(
  prompt: string,
  result: AIPlanResult,
): PlannerOutput | null {
  if (!result.ok || !result.plan) return null;
  const plan = result.plan;
  const files = plan.files.map((f) => ({ path: f.path, reason: f.reason }));
  return {
    goal: prompt.trim(),
    intent: plan.summary.trim(),
    selectedFiles: files,
    selectedSymbols: [],
    risks: [...plan.risks],
    verificationPlan: "Run TypeScript check and production build after apply.",
    executionSteps: files.map((f) => `Patch ${f.path}: ${f.reason}`),
    summary: plan.summary.trim(),
  };
}

export function formatPlannerOutputSummary(output: PlannerOutput): string {
  return [
    `Goal: ${output.goal}`,
    `Intent: ${output.intent}`,
    `Files: ${output.selectedFiles.length}`,
    output.risks.length ? `Risks: ${output.risks.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
