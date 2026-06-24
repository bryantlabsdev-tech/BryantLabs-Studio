import {
  appendAgentFeed,
  appendAgentHistory,
  mergeAgentArtifacts,
  recordAgentDecision,
  setAgentStatus,
  setTimelineStage,
  startAgentSession,
} from "@/core/agentWorkspace";
import { buildApplyPlanFailureReport } from "@/core/diagnostics/failureReport";
import {
  buildCompletionReport,
  buildRoadmap,
  extractGoalTitle,
  MAX_BUILDER_PHASE_REPAIRS,
  mergeUniqueFiles,
  nextPendingPhase,
  phaseNeedsApproval,
  updatePhase,
  type BuilderApprovalMode,
  type BuilderSession,
} from "@/core/builder";
import { generatePlan as buildPlan } from "@/core/planner";
import {
  effectivePlanPrompt,
  recordDeterministicPlan,
  recordPrompt,
} from "@/core/sessionMemory";
import type {
  BuilderOrchestrationHost,
  BuilderPhaseOnceResult,
} from "@/app/orchestration/builderTypes";

const BUILDER_POLL_MS = 250;

async function waitWhileBuilderPaused(
  host: BuilderOrchestrationHost,
): Promise<boolean> {
  while (host.builderControlRef.current.paused) {
    if (host.builderControlRef.current.stopped) return false;
    await new Promise((r) => setTimeout(r, BUILDER_POLL_MS));
  }
  return !host.builderControlRef.current.stopped;
}

async function runBuilderPhaseOnceOrchestration(
  host: BuilderOrchestrationHost,
  phasePrompt: string,
): Promise<BuilderPhaseOnceResult> {
  if (!host.scan) {
    return {
      ok: false,
      verification: null,
      filesModified: [],
      filesCreated: [],
      error: "Project scan unavailable.",
    };
  }
  const trimmed = phasePrompt.trim();
  host.pushAgent((s) => {
    let n = appendAgentFeed(s, "planning", "Phase plan", trimmed);
    return appendAgentHistory(n, "prompt", "Phase prompt", trimmed);
  });
  let mem = host.sessionMemory;
  mem = recordPrompt(mem, trimmed);
  const effective = effectivePlanPrompt(trimmed, mem);
  const detPlan = buildPlan(effective, host.scan, {
    projectPath: host.project?.path ?? null,
    projectMemory: host.projectMemoryRef.current,
    sessionMemory: mem,
  });
  host.setSessionMemory((m) =>
    recordDeterministicPlan(m, effective, {
      summary: detPlan.summary,
      files: detPlan.files,
    }),
  );
  host.setPlan(detPlan);
  host.setLastPlanPrompt(trimmed);
  host.refreshSmartFileSelection(trimmed, mem);

  const ai = await host.executeAIPlanForPrompt(trimmed, detPlan);
  if (!ai?.ok || !ai.plan) {
    return {
      ok: false,
      verification: null,
      filesModified: [],
      filesCreated: [],
      error: ai?.error ?? ai?.parseError ?? "AI Plan failed",
    };
  }

  const execSession = host.createExecutionSessionFromPlans(detPlan, ai, trimmed);
  if (!execSession) {
    return {
      ok: false,
      verification: null,
      filesModified: [],
      filesCreated: [],
      error: "No execution targets for this phase.",
    };
  }

  host.setExecutionSession(execSession);
  for (const f of execSession.files) {
    host.pushAgent((s) => recordAgentDecision(s, f.relPath, f.planReason));
  }
  const exec = await host.executeMultiFileLoop(execSession);
  const filesModified = [...exec.filesModified];
  const filesCreated = execSession.files
    .filter((f) => f.isNewFile && filesModified.includes(f.relPath))
    .map((f) => f.relPath);

  if (exec.ok) {
    return {
      ok: true,
      verification: exec.verification,
      filesModified,
      filesCreated,
    };
  }

  if (exec.verification) {
    const report = buildApplyPlanFailureReport({
      verification: exec.verification,
      verifyErr: null,
    });
    const fix = await host.runAutoFixAutomatic({
      verification: exec.verification,
      applied: filesModified,
      prompt: trimmed,
      planSummary: ai.plan.summary,
      planSource: "ai",
      failureLine: report.rootCauseLine,
    });
    if (fix.ok) {
      return {
        ok: true,
        verification: fix.verification,
        filesModified,
        filesCreated,
      };
    }
  }

  return {
    ok: false,
    verification: exec.verification,
    filesModified,
    filesCreated,
    error: exec.error ?? "Phase execution failed",
  };
}

export async function runBuilderOrchestratorOrchestration(
  host: BuilderOrchestrationHost | null,
  initial: BuilderSession,
): Promise<void> {
  if (!host?.api || !host.scan || !host.project) return;

  let session: BuilderSession = {
    ...initial,
    status: "running",
    error: null,
  };
  host.setBuilderSession(session);
  host.setRailTool("builder");

  host.pushAgent((s) => {
    let n = startAgentSession(s, session.goal.rawPrompt);
    n = appendAgentFeed(n, "thinking", "Analyzing goal", session.goal.rawPrompt);
    n = appendAgentFeed(
      n,
      "thinking",
      "Building roadmap",
      `${session.phases.length} phases`,
    );
    n = appendAgentHistory(n, "prompt", "Build goal", session.goal.rawPrompt);
    return n;
  });

  host.beginStudioAction(
    "autonomous_builder",
    "autonomous_builder",
    "Autonomous build started",
    { details: session.goal.rawPrompt },
  );

  let lastVerificationOk = true;

  while (true) {
    const mayContinue = await waitWhileBuilderPaused(host);
    if (!mayContinue) {
      session = {
        ...session,
        status: "stopped",
        completedAt: Date.now(),
      };
      host.setBuilderSession(session);
      host.finishStudioAction(
        "autonomous_builder",
        "autonomous_builder",
        false,
        "Build stopped",
      );
      return;
    }

    const phase = nextPendingPhase(session.phases);
    if (!phase) break;

    if (
      phase.status === "pending" &&
      phaseNeedsApproval(phase, session.mode) &&
      host.builderSkipApprovalRef.current !== phase.id
    ) {
      session = {
        ...session,
        status: "awaiting_approval",
        currentPhaseId: phase.id,
      };
      host.setBuilderSession(session);
      return;
    }
    host.builderSkipApprovalRef.current = null;

    const startedAt = Date.now();
    session = {
      ...session,
      currentPhaseId: phase.id,
      phases: updatePhase(session.phases, phase.id, {
        status: "running",
        startedAt,
        error: null,
      }),
    };
    host.setBuilderSession(session);
    host.appendGreenfieldRunLog(
      "autonomous_builder",
      "running",
      `Phase ${phase.index + 1}: ${phase.title}`,
      phase.description,
    );
    host.pushAgent((s) =>
      appendAgentFeed(
        s,
        "executing",
        `Phase ${phase.index + 1}: ${phase.title}`,
        phase.description,
      ),
    );

    let phaseOk = false;
    let phaseError: string | null = null;
    let phaseFilesModified: string[] = [];
    let phaseFilesCreated: string[] = [];
    let repairs = phase.repairAttempts;

    while (repairs < MAX_BUILDER_PHASE_REPAIRS && !phaseOk) {
      const mayRun = await waitWhileBuilderPaused(host);
      if (!mayRun) break;

      const result = await runBuilderPhaseOnceOrchestration(host, phase.prompt);
      phaseFilesModified = result.filesModified;
      phaseFilesCreated = result.filesCreated;
      if (result.ok) {
        phaseOk = true;
        lastVerificationOk = true;
        break;
      }
      phaseError = result.error ?? "Phase failed";
      repairs += 1;
      session = {
        ...session,
        phases: updatePhase(session.phases, phase.id, {
          repairAttempts: repairs,
        }),
      };
      host.setBuilderSession(session);
    }

    if (!phaseOk) {
      session = {
        ...session,
        status: "failed",
        currentPhaseId: phase.id,
        error: phaseError,
        phases: updatePhase(session.phases, phase.id, {
          status: "failed",
          completedAt: Date.now(),
          error: phaseError,
        }),
        completedAt: Date.now(),
      };
      host.setBuilderSession(session);
      host.finishStudioAction(
        "autonomous_builder",
        "autonomous_builder",
        false,
        `Build failed at phase ${phase.index + 1}`,
        phaseError ? { details: phaseError } : undefined,
      );
      return;
    }

    const merged = mergeUniqueFiles(
      session.allFilesModified,
      phaseFilesModified,
      phaseFilesCreated,
    );
    session = {
      ...session,
      allFilesModified: merged.modified,
      allFilesCreated: merged.created,
      phases: updatePhase(session.phases, phase.id, {
        status: "completed",
        completedAt: Date.now(),
        filesModified: phaseFilesModified,
        filesCreated: phaseFilesCreated,
        error: null,
      }),
      currentPhaseId: null,
    };
    host.setBuilderSession(session);
    host.pushAgent((s) => {
      let n = mergeAgentArtifacts(s, {
        filesModified: phaseFilesModified,
        filesCreated: phaseFilesCreated,
      });
      n = appendAgentHistory(
        n,
        "execution",
        `Phase ${phase.index + 1} completed`,
        phase.title,
      );
      return n;
    });
    host.appendGreenfieldRunLog(
      "autonomous_builder",
      "success",
      `Phase ${phase.index + 1} completed`,
      phaseFilesModified.length > 0
        ? phaseFilesModified.join(", ")
        : undefined,
    );
  }

  const report = buildCompletionReport(session, lastVerificationOk);
  session = {
    ...session,
    status: "completed",
    completedAt: Date.now(),
    report,
    currentPhaseId: null,
  };
  host.setBuilderSession(session);
  host.pushAgent((s) => {
    let n = setAgentStatus(s, "completed");
    n = setTimelineStage(n, "complete", "done");
    return appendAgentFeed(
      n,
      "completed",
      "Build completed",
      `${report.phasesCompleted}/${report.phasesTotal} phases`,
    );
  });
  void host.runScan();

  host.finishStudioAction(
    "autonomous_builder",
    "autonomous_builder",
    true,
    "Autonomous build completed",
    {
      details: `${report.phasesCompleted}/${report.phasesTotal} phases · ${Math.round(report.durationMs / 1000)}s`,
    },
  );
}

export async function startAutonomousBuildOrchestration(
  host: BuilderOrchestrationHost | null,
  goalPrompt: string,
  mode: BuilderApprovalMode,
): Promise<void> {
  if (!host?.api || !host.project || !host.scan) {
    host?.setBuilderError("Open a project before starting a build.");
    return;
  }
  const trimmed = goalPrompt.trim();
  if (trimmed.length < 4) {
    host.setBuilderError("Enter a build goal (e.g. Build a task manager app).");
    return;
  }

  host.builderControlRef.current = { paused: false, stopped: false };
  host.builderSkipApprovalRef.current = null;
  const goal = {
    rawPrompt: trimmed,
    title: extractGoalTitle(trimmed),
    createdAt: Date.now(),
  };
  const phases = buildRoadmap(goal);
  const session: BuilderSession = {
    goal,
    mode,
    phases,
    status: "ready",
    currentPhaseId: null,
    startedAt: Date.now(),
    completedAt: null,
    allFilesModified: [],
    allFilesCreated: [],
    report: null,
    error: null,
  };
  host.setBuilderError(null);
  host.setBuilderSession(session);
  host.setRailTool("agent");

  if (mode === "autonomous") {
    await runBuilderOrchestratorOrchestration(host, session);
  } else if (mode === "manual" || mode === "hybrid") {
    const first = phases[0];
    if (first && phaseNeedsApproval(first, mode)) {
      host.setBuilderSession({
        ...session,
        status: "awaiting_approval",
        currentPhaseId: first.id,
      });
    } else {
      await runBuilderOrchestratorOrchestration(host, session);
    }
  }
}

export function pauseAutonomousBuildOrchestration(
  host: BuilderOrchestrationHost | null,
): void {
  if (!host) return;
  host.builderControlRef.current.paused = true;
  host.setBuilderSession((prev) =>
    prev && prev.status === "running" ? { ...prev, status: "paused" } : prev,
  );
  host.pushAgent((s) => {
    let n = setAgentStatus(s, "paused");
    return appendAgentFeed(n, "thinking", "Build paused", null);
  });
}

export async function resumeAutonomousBuildOrchestration(
  host: BuilderOrchestrationHost | null,
): Promise<void> {
  if (!host?.builderSession) return;
  host.builderControlRef.current.paused = false;
  host.pushAgent((s) => {
    let n = setAgentStatus(s, "active");
    return appendAgentFeed(n, "thinking", "Build resumed", null);
  });
  const session =
    host.builderSession.status === "paused"
      ? { ...host.builderSession, status: "running" as const }
      : host.builderSession;
  host.setBuilderSession(session);
  await runBuilderOrchestratorOrchestration(host, session);
}

export function stopAutonomousBuildOrchestration(
  host: BuilderOrchestrationHost | null,
): void {
  if (!host) return;
  host.builderControlRef.current.stopped = true;
  host.builderControlRef.current.paused = false;
  host.setBuilderSession((prev) =>
    prev
      ? {
          ...prev,
          status: "stopped",
          completedAt: Date.now(),
        }
      : prev,
  );
  host.pushAgent((s) => {
    let n = setAgentStatus(s, "stopped");
    return appendAgentFeed(n, "completed", "Build stopped", null);
  });
}

export async function approveBuilderPhaseOrchestration(
  host: BuilderOrchestrationHost | null,
): Promise<void> {
  if (!host?.builderSession || host.builderSession.status !== "awaiting_approval") {
    return;
  }
  if (host.builderSession.currentPhaseId) {
    host.builderSkipApprovalRef.current = host.builderSession.currentPhaseId;
  }
  const session: BuilderSession = {
    ...host.builderSession,
    status: "running",
  };
  host.setBuilderSession(session);
  await runBuilderOrchestratorOrchestration(host, session);
}
