import {
  createExecutionSession,
  type ExecutionFileEntry,
  type ExecutionSession,
} from "@/core/execution";
import {
  collectPlanApplyTargets,
  resolveUserPlanPrompt,
} from "@/core/planApply";
import { MAX_PLAN_APPLY_FILES } from "@/core/planApply/collectTargets";
import { SELECTION_REASON } from "@/core/planApply/targetPolicy";
import { resolvePlanFilePath } from "@/core/planApply/resolve";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Plan } from "@/core/planner";
import type { ExecutionOrchestrationHost } from "@/app/orchestration/executionTypes";
import { executeMultiFileLoopOrchestration } from "@/app/orchestration/executionLoop";

function mergePlanTargets(
  host: ExecutionOrchestrationHost,
  deterministicPlan: Plan,
  aiPlanResult: AIPlanResult,
  userPrompt: string,
) {
  const { prompt, summary, source, targets } = collectPlanApplyTargets(
    deterministicPlan,
    aiPlanResult,
    host.scan!,
    userPrompt,
    {
      projectPath: host.project!.path,
      projectMemory: host.projectMemoryRef.current,
      sessionMemory: host.sessionMemory,
    },
  );
  const mergedTargets = [...targets];
  const seen = new Set(targets.map((t) => t.relPath));
  for (const f of aiPlanResult.plan!.files) {
    if (mergedTargets.length >= MAX_PLAN_APPLY_FILES) break;
    if (resolvePlanFilePath(f.path, host.scan!)) continue;
    const rel = f.path.replace(/^\.\//, "").replace(/\\/g, "/");
    if (!rel || rel.includes("..") || seen.has(rel)) continue;
    seen.add(rel);
    const root = host.project!.path.replace(/[/\\]+$/, "");
    mergedTargets.push({
      relPath: rel,
      absPath: `${root}/${rel}`,
      reason: f.reason,
      selectionReason: SELECTION_REASON.aiPlan,
      planReason: f.reason,
    });
  }
  return { prompt, summary, source, mergedTargets };
}

export function createExecutionSessionFromPlansOrchestration(
  host: ExecutionOrchestrationHost | null,
  deterministicPlan: Plan,
  aiPlanResult: AIPlanResult,
  userPrompt: string,
): ExecutionSession | null {
  if (
    !host?.scan ||
    !host.project ||
    !aiPlanResult.ok ||
    !aiPlanResult.plan
  ) {
    return null;
  }
  const { prompt, summary, source, mergedTargets } = mergePlanTargets(
    host,
    deterministicPlan,
    aiPlanResult,
    userPrompt,
  );
  if (mergedTargets.length === 0) return null;
  return createExecutionSession({
    prompt,
    summary,
    source,
    targets: mergedTargets,
    aiPlan: aiPlanResult,
    scan: host.scan,
    projectRoot: host.project.path,
  });
}

export async function startMultiFileExecutionOrchestration(
  host: ExecutionOrchestrationHost | null,
): Promise<void> {
  if (!host?.api || !host.project || !host.scan || !host.plan) return;
  const userPrompt = resolveUserPlanPrompt(host.plan, host.lastPlanPrompt);
  if (!userPrompt) {
    host.setExecutionError(
      "Enter your change request in the Plan tab, then Analyze & plan.",
    );
    return;
  }
  if (!host.aiPlan?.ok || !host.aiPlan.plan) {
    host.setExecutionError("Run AI Plan first, then start multi-file execution.");
    return;
  }

  const session = createExecutionSessionFromPlansOrchestration(
    host,
    host.plan,
    host.aiPlan,
    userPrompt,
  );
  if (!session) {
    host.setExecutionError("No files in the AI plan to execute.");
    return;
  }

  host.setExecutionError(null);
  host.setExecutionSession(session);
  host.setRailTool("execution");
  host.beginStudioAction(
    "multi_file_execution",
    "multi_file_execution",
    "Execution plan built",
    {
      details: session.diagnostics.executionPlanLines.join(" · "),
      patch: {
        workflow: {
          prompt: session.prompt,
          planSummary: session.planSummary,
          planSource: session.planSource,
          filesProposed: session.files.length,
        },
      },
    },
  );
  host.finishStudioAction(
    "multi_file_execution",
    "multi_file_execution",
    true,
    "Execution plan ready",
    {
      details: `${session.steps.length} step(s), ${session.files.length} file(s)`,
    },
  );
}

export async function runMultiFileExecutionOrchestration(
  host: ExecutionOrchestrationHost | null,
): Promise<void> {
  if (!host?.executionSession) return;
  if (
    host.executionSession.phase !== "ready" &&
    host.executionSession.phase !== "paused"
  ) {
    return;
  }
  host.setExecutionError(null);
  await executeMultiFileLoopOrchestration(host, host.executionSession);
}

export function resetExecutionStepState(
  session: ExecutionSession,
  stepId: string,
  clearProposals: boolean,
): ExecutionSession {
  const steps = session.steps.map((s) => {
    if (s.id !== stepId) return s;
    const { error: _removed, ...rest } = s;
    return { ...rest, status: "pending" as const };
  });
  const files: ExecutionFileEntry[] = session.files.map((f) => {
    if (f.stepId !== stepId) return f;
    if (f.status === "applied" || f.status === "verified") return f;
    const next: ExecutionFileEntry = {
      relPath: f.relPath,
      absPath: f.absPath,
      stepId: f.stepId,
      planReason: f.planReason,
      selectionReason: f.selectionReason,
      isNewFile: f.isNewFile,
      status: "pending",
    };
    if (!clearProposals && f.proposal) {
      return {
        ...next,
        ...(f.basisContent !== undefined ? { basisContent: f.basisContent } : {}),
        proposal: f.proposal,
        ...(f.patch ? { patch: f.patch } : {}),
      };
    }
    return next;
  });
  return {
    ...session,
    steps,
    files,
    phase: "ready",
    pausedAtStepId: null,
    applyError: null,
  };
}

export async function retryExecutionStepOrchestration(
  host: ExecutionOrchestrationHost | null,
): Promise<void> {
  if (!host?.executionSession?.pausedAtStepId) return;
  const updated = resetExecutionStepState(
    host.executionSession,
    host.executionSession.pausedAtStepId,
    false,
  );
  host.setExecutionSession(updated);
  await executeMultiFileLoopOrchestration(host, updated);
}

export async function skipExecutionStepOrchestration(
  host: ExecutionOrchestrationHost | null,
): Promise<void> {
  if (!host?.executionSession?.pausedAtStepId) return;
  const stepId = host.executionSession.pausedAtStepId;
  const updated: ExecutionSession = {
    ...host.executionSession,
    steps: host.executionSession.steps.map((s) => {
      if (s.id !== stepId) return s;
      const { error: _removed, ...rest } = s;
      return { ...rest, status: "skipped" as const };
    }),
    phase: "ready",
    pausedAtStepId: null,
    applyError: null,
  };
  host.setExecutionSession(updated);
  await executeMultiFileLoopOrchestration(host, updated);
}

export async function regenerateExecutionStepOrchestration(
  host: ExecutionOrchestrationHost | null,
): Promise<void> {
  if (!host?.executionSession?.pausedAtStepId) return;
  const updated = resetExecutionStepState(
    host.executionSession,
    host.executionSession.pausedAtStepId,
    true,
  );
  host.setExecutionSession(updated);
  await executeMultiFileLoopOrchestration(host, updated);
}

export function cancelMultiFileExecutionOrchestration(
  host: ExecutionOrchestrationHost | null,
): void {
  if (!host) return;
  host.setExecutionSession(null);
  host.setExecutionError(null);
}
