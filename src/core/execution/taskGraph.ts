import type { ExecutionStep, TaskGraph } from "@/core/execution/types";

export function buildTaskGraph(steps: readonly ExecutionStep[]): TaskGraph {
  return {
    nodes: steps.map((step) => ({
      stepId: step.id,
      title: step.title,
      files: step.filePaths,
      dependsOn: step.dependsOn,
      status: step.status,
    })),
  };
}

export function nextPendingStep(
  steps: readonly ExecutionStep[],
): ExecutionStep | null {
  const completed = new Set(
    steps.filter((s) => s.status === "completed" || s.status === "skipped").map(
      (s) => s.id,
    ),
  );
  for (const step of steps) {
    if (step.status !== "pending") continue;
    const depsOk = step.dependsOn.every((d) => completed.has(d));
    if (depsOk) return step;
  }
  return null;
}
