import type { PlanApplyTarget } from "@/core/planApply/collectTargets";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { ProjectScan } from "@/types";
import {
  buildExecutionPlan,
  type ExecutionPlanInput,
} from "@/core/execution/executionPlan";
import { orderFilesInStep } from "@/core/execution/dependencyOrder";
import { buildExecutionDiagnostics } from "@/core/execution/diagnostics";
import type {
  ExecutionFileEntry,
  ExecutionSession,
} from "@/core/execution/types";
import { resolvePlanFilePath } from "@/core/planApply/resolve";

export function createExecutionSession(input: {
  prompt: string;
  summary: string;
  source: "ai" | "deterministic";
  targets: readonly PlanApplyTarget[];
  aiPlan: AIPlanResult | null;
  scan: ProjectScan;
  projectRoot: string;
}): ExecutionSession {
  const plannedPaths =
    input.aiPlan?.ok && input.aiPlan.plan
      ? input.aiPlan.plan.files.map((f) => ({
          path: f.path,
          planReason: f.reason,
        }))
      : [];

  const planInput: ExecutionPlanInput = {
    prompt: input.prompt,
    summary: input.summary,
    source: input.source,
    targets: input.targets,
    plannedPaths,
    scan: input.scan,
    projectRoot: input.projectRoot,
  };

  const steps = buildExecutionPlan(planInput);
  const isNew = new Set<string>();

  for (const p of plannedPaths) {
    if (!resolvePlanFilePath(p.path, input.scan)) {
      const normalized = p.path.replace(/^\.\//, "").replace(/\\/g, "/");
      if (normalized && !normalized.includes("..")) isNew.add(normalized);
    }
  }

  const files: ExecutionFileEntry[] = [];
  for (const step of steps) {
    const ordered = orderFilesInStep(
      step.filePaths,
      input.scan,
      (rel) => isNew.has(rel),
    );
    for (const relPath of ordered) {
      const target = input.targets.find((t) => t.relPath === relPath);
      const planned = plannedPaths.find(
        (p) =>
          resolvePlanFilePath(p.path, input.scan)?.relPath === relPath ||
          p.path.replace(/^\.\//, "") === relPath,
      );
      const resolved = resolvePlanFilePath(relPath, input.scan);
      const absPath =
        target?.absPath ??
        resolved?.absPath ??
        `${input.projectRoot.replace(/[/\\]+$/, "")}/${relPath}`;
      files.push({
        relPath,
        absPath,
        stepId: step.id,
        planReason: target?.planReason ?? planned?.planReason ?? "Execution step",
        selectionReason:
          target?.selectionReason ?? "Coordinated multi-file execution",
        isNewFile: isNew.has(relPath) || !resolved,
        status: "pending",
      });
    }
  }

  return {
    prompt: input.prompt,
    planSummary: input.summary,
    planSource: input.source,
    steps,
    files,
    phase: "ready",
    currentStepId: null,
    pausedAtStepId: null,
    applyError: null,
    verification: null,
    diagnostics: buildExecutionDiagnostics(steps, [], null),
  };
}
