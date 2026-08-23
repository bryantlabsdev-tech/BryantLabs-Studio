import { useCallback, useEffect } from "react";
import {
  buildAgentExportContext,
  emptyAgentWorkspaceSession,
  formatAgentFullReportJson,
  formatAgentFullReportMarkdown,
  syncAgentSessionFromPipeline,
  type AgentWorkspaceSession,
} from "@/core/agentWorkspace";
import type { AgentLoopWorkspaceState } from "@/app/workspace/useAgentLoopWorkspaceState";
import type { VerificationResult } from "@/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { Plan } from "@/core/planner";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { BuilderSession } from "@/core/builder";
import type { ExecutionSession } from "@/core/execution";

export function useWorkspaceAgentSessionActions(input: {
  readonly projectPath: string | undefined;
  readonly agentLoop: Pick<
    AgentLoopWorkspaceState,
    "agentSession" | "setAgentSession" | "agentLoopSession" | "agentLoopError"
  >;
  readonly builderSession: BuilderSession | null;
  readonly executionSession: ExecutionSession | null;
  readonly aiPlan: AIPlanResult | null;
  readonly plan: Plan | null;
  readonly lastPlanPrompt: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly verification: VerificationResult | null;
}) {
  const pushAgent = useCallback(
    (update: (session: AgentWorkspaceSession) => AgentWorkspaceSession) => {
      input.agentLoop.setAgentSession((prev) => {
        const base =
          prev && prev.status !== "idle"
            ? prev
            : { ...emptyAgentWorkspaceSession(), status: "active" as const };
        return update(base);
      });
    },
    [input.agentLoop.setAgentSession],
  );

  const exportAgentReport = useCallback(
    (format: "markdown" | "json") => {
      const ctx = buildAgentExportContext({
        projectPath: input.projectPath ?? null,
        agentSession: input.agentLoop.agentSession ?? emptyAgentWorkspaceSession(),
        agentLoopSession: input.agentLoop.agentLoopSession,
        agentLoopError: input.agentLoop.agentLoopError,
        provider: input.greenfieldRun.provider ?? null,
        model: input.greenfieldRun.model ?? null,
        lastPlanPrompt: input.lastPlanPrompt,
        planSummary: input.plan?.summary ?? null,
        verification: input.verification,
        failureReport: input.greenfieldRun.failureReport ?? null,
      });
      const text =
        format === "json"
          ? formatAgentFullReportJson(ctx)
          : formatAgentFullReportMarkdown(ctx);
      const blob = new Blob([text], {
        type: format === "json" ? "application/json" : "text/markdown",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bryantlabs-agent-report-${Date.now()}.${format === "json" ? "json" : "md"}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [input],
  );

  const clearAgentSession = useCallback(() => {
    input.agentLoop.setAgentSession(null);
  }, [input.agentLoop.setAgentSession]);

  const builderSession = input.builderSession;
  const executionSession = input.executionSession;
  const builderPhase = builderSession?.currentPhaseId
    ? builderSession.phases.find((p) => p.id === builderSession.currentPhaseId)
    : null;
  const executionStep = executionSession?.currentStepId
    ? executionSession.steps.find((s) => s.id === executionSession.currentStepId)
    : null;
  const proposingFile = executionSession?.files.find((f) => f.status === "proposing");
  const modelLabel = input.aiPlan?.ok
    ? `${input.aiPlan.provider} · ${input.aiPlan.model}`
    : input.greenfieldRun.provider && input.greenfieldRun.model
      ? `${input.greenfieldRun.provider} · ${input.greenfieldRun.model}`
      : null;
  const tokenHint = input.aiPlan?.ok && input.aiPlan.latencyMs
    ? `${input.aiPlan.latencyMs}ms`
    : null;

  useEffect(() => {
    const setAgentSession = input.agentLoop.setAgentSession;
    setAgentSession((prev) =>
      syncAgentSessionFromPipeline(prev, {
        goal: builderSession?.goal.rawPrompt ?? null,
        phase: builderPhase ? `Phase ${builderPhase.index + 1}: ${builderPhase.title}` : null,
        task: executionStep?.title ?? executionSession?.planSummary ?? null,
        file: proposingFile?.relPath ?? null,
        model: modelLabel,
        tokens: tokenHint,
      }),
    );
  }, [
    input.agentLoop.setAgentSession,
    builderSession?.goal.rawPrompt,
    builderPhase?.index,
    builderPhase?.title,
    executionStep?.title,
    executionSession?.planSummary,
    proposingFile?.relPath,
    modelLabel,
    tokenHint,
  ]);

  return {
    pushAgent,
    exportAgentReport,
    clearAgentSession,
  };
}
