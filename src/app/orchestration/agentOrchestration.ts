import {
  appendAgentFeed,
  appendAgentHistory,
  appendAgentReasoning,
  patchAgentContext,
  setAgentStatus,
  setTimelineStage,
  startAgentSession,
} from "@/core/agentWorkspace";
import {
  getAgentStartGate,
  NO_PROJECT_FILES_MESSAGE,
} from "@/core/agent/agentReadiness";
import {
  checkActionSafety,
  createAgentLoopSession,
  createLlmDecideNextAction,
  patchAgentFlags,
  runAgentLoop,
  tasksFromFilePaths,
  type AgentActCallbacks,
  type AgentLoopSession,
} from "@/core/agentLoop";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import { isApplyPlanOrchestrationComplete } from "@/core/orchestration/applyPlanSuccess";
import { resolvePlanFilePath } from "@/core/planApply/resolve";
import {
  findSymbolReferences,
  searchRepository,
} from "@/core/repository";
import { mergeRepositoryAndSemanticHits } from "@/core/semanticIndex/hybridSearch";
import { BRYANTLABS_AGENT_DISPLAY_NAME } from "@/core/studioRun/types";
import { verificationSummaryLines } from "@/core/studioRun/types";
import { exploreRepositoryBeforeEdit } from "@/core/agent/editExploration";
import { resolvePlannerSemanticBoostPaths } from "@/core/context/plannerSemanticBoost";
import { invokeMcpTool as invokeMcpToolClient } from "@/core/mcp/client";
import type { AgentOrchestrationHost } from "@/app/orchestration/agentTypes";

function buildAgentActCallbacks(
  host: AgentOrchestrationHost,
): AgentActCallbacks | null {
  if (!host.api || !host.scan || !host.project || !host.repository) {
    return null;
  }
  const studioApi = host.api;
  const repo = host.repository;
  const projectRoot = host.project.path;
  const projectScan = host.scan;

  const hybridSearch = async (query: string) => {
    const lexical = searchRepository(repo, query);
    if (!studioApi.semanticSearch) return lexical;
    try {
      const semantic = await studioApi.semanticSearch(query, 12);
      return mergeRepositoryAndSemanticHits(lexical, semantic);
    } catch {
      return lexical;
    }
  };

  return {
    searchFiles: hybridSearch,
    grepContent: async (query) => {
      if (!studioApi.grepProject) {
        return { ok: false, hits: [], error: "Grep requires the desktop app." };
      }
      const res = await studioApi.grepProject(query, 40);
      if ("error" in res) {
        return { ok: false, hits: [], error: res.error };
      }
      return { ok: true, hits: [...res.hits] };
    },
    searchSymbols: hybridSearch,
    findReferences: (symbol) => findSymbolReferences(repo, symbol),
    readFile: async (relPath) => {
      const root = projectRoot.replace(/[/\\]+$/, "");
      const abs = `${root}/${relPath.replace(/^\.\//, "")}`;
      try {
        const res = await studioApi.readFile(abs);
        if (!res.readable || res.content === undefined) {
          return { ok: false, preview: "" };
        }
        return { ok: true, preview: res.content.slice(0, 2000) };
      } catch {
        return { ok: false, preview: "" };
      }
    },
    createPlan: async (goal) => {
      const readContents = Object.entries(
        host.agentLoopSession?.flags.readFileContents ?? {},
      ).map(([path, content]) => ({ path, content }));
      if (readContents.length > 0) {
        host.editExplorationContentsRef.current = readContents;
      }
      const det = host.createPlan(goal);
      if (!det) {
        return {
          ok: false,
          fileCount: 0,
          newFileCount: 0,
          paths: [],
          error:
            host.createPlanErrorRef.current ??
            "Could not build deterministic plan.",
        };
      }
      const ai = await host.executeAIPlanForPrompt(goal, det);
      if (!ai?.ok || !ai.plan) {
        return {
          ok: false,
          fileCount: 0,
          newFileCount: 0,
          paths: [],
          error: ai?.error ?? ai?.parseError ?? "AI plan failed.",
        };
      }
      let newFileCount = 0;
      const paths: string[] = [];
      for (const f of ai.plan.files) {
        paths.push(f.path);
        if (!resolvePlanFilePath(f.path, projectScan)) {
          newFileCount += 1;
        }
      }
      const safety = checkActionSafety(
        "create_plan",
        {},
        createAgentLoopSession(goal),
        { newFileCount, goal },
      );
      if (
        safety.needsApproval &&
        !host.agentControlRef.current.safetyApproved
      ) {
        return {
          ok: false,
          fileCount: ai.plan.files.length,
          newFileCount,
          paths,
          needsApproval: true,
          error: safety.reason,
        };
      }
      host.setAgentLoopSession((prev) =>
        prev
          ? {
              ...prev,
              dynamicTasks: [
                ...prev.dynamicTasks,
                ...tasksFromFilePaths(paths, prev.dynamicTasks.length),
              ],
            }
          : prev,
      );
      host.agentControlRef.current.safetyApproved = false;
      return {
        ok: true,
        fileCount: ai.plan.files.length,
        newFileCount,
        paths,
      };
    },
    modifyFiles: async () => {
      const cached = host.applyPlanSuccessRef.current;
      if (cached && isApplyPlanOrchestrationComplete(cached)) {
        return {
          ok: true,
          filesModified: [...cached.filesWritten],
        };
      }
      const userPrompt =
        host.lastPlanPrompt ?? host.agentLoopSession?.goal ?? "";
      const det = host.plan;
      const ai = host.aiPlan;
      if (!det || !ai?.ok || !ai.plan) {
        return {
          ok: false,
          filesModified: [],
          error: "No AI plan available for execution.",
        };
      }
      const execSession = host.createExecutionSessionFromPlans(
        det,
        ai,
        userPrompt,
      );
      if (!execSession) {
        return {
          ok: false,
          filesModified: [],
          error: "Could not build execution session.",
        };
      }
      const safety = checkActionSafety(
        "modify_files",
        {},
        createAgentLoopSession(userPrompt),
        { modifyFileCount: execSession.files.length, goal: userPrompt },
      );
      if (
        safety.needsApproval &&
        !host.agentControlRef.current.safetyApproved
      ) {
        return {
          ok: false,
          filesModified: [],
          error: safety.reason,
        };
      }
      host.agentControlRef.current.safetyApproved = false;
      host.setExecutionSession(execSession);
      const exec = await host.executeMultiFileLoop(execSession);
      host.agentLastExecRef.current = exec;
      return {
        ok: exec.ok,
        filesModified: [...exec.filesModified],
        ...(exec.error !== undefined ? { error: exec.error } : {}),
      };
    },
    runVerification: async () => {
      const cached = host.applyPlanSuccessRef.current;
      if (cached && isApplyPlanOrchestrationComplete(cached)) {
        return {
          ok: true,
          summary: "TypeScript and build passed (Apply Plan).",
        };
      }
      host.setVerifyStatus("running");
      try {
        const res = await studioApi.verify();
        if ("error" in res) {
          host.setVerifyStatus("error");
          host.setVerifyError(res.error);
          return { ok: false, summary: res.error };
        }
        host.setVerification(res);
        host.setVerifyStatus("done");
        const lines = verificationSummaryLines(res);
        return {
          ok: lines.ok,
          summary: lines.ok
            ? "TypeScript and build passed."
            : `Typecheck ${lines.typecheck}; build ${lines.build}`,
        };
      } catch {
        host.setVerifyStatus("error");
        return { ok: false, summary: "Verification failed to run." };
      }
    },
    runAutoFix: async () => {
      const last = host.agentLastExecRef.current;
      const ver =
        last?.verification ??
        host.verification ??
        (await studioApi.verify().catch(() => null));
      if (!ver || "error" in ver) {
        return { ok: false, summary: "No verification result for Auto Fix." };
      }
      const userPrompt =
        host.lastPlanPrompt ?? host.agentLoopSession?.goal ?? "";
      const det = host.plan;
      const summary = det?.summary ?? `${BRYANTLABS_AGENT_DISPLAY_NAME} execution`;
      const source = "ai";
      const applied =
        last?.filesModified ??
        host.agentLastExecRef.current?.filesModified ??
        [];
      const lines = verificationSummaryLines(ver);
      const failureLine = lines.ok
        ? "Verification passed"
        : `Typecheck ${lines.typecheck}; build ${lines.build}`;
      const fix = await host.runAutoFixAutomatic({
        verification: ver,
        applied,
        prompt: userPrompt,
        planSummary: summary,
        planSource: source,
        failureLine,
      });
      return {
        ok: fix.ok,
        summary: fix.ok
          ? "Auto Fix repaired verification errors."
          : "Auto Fix finished without passing verification.",
      };
    },
    runCommand: async (command) => {
      if (!studioApi.terminalExec) {
        return {
          ok: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          error: "Terminal exec requires the desktop app.",
        };
      }
      const res = await studioApi.terminalExec(projectRoot, command);
      if ("error" in res) {
        return {
          ok: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          error: res.error,
        };
      }
      return {
        ok: res.ok,
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.exitCode,
        ...(res.error !== undefined ? { error: res.error } : {}),
      };
    },
    invokeMcpTool: async (tool, args) => {
      const res = await invokeMcpToolClient(studioApi, tool, args);
      return {
        ok: res.ok,
        content: res.content,
        ...(res.error !== undefined ? { error: res.error } : {}),
      };
    },
  };
}

export async function runAgentOrchestratorOrchestration(
  host: AgentOrchestrationHost | null,
  initial: AgentLoopSession,
): Promise<void> {
  if (!host) return;
  const act = buildAgentActCallbacks(host);
  if (!act) {
    host.setAgentLoopError("Project, scan, or repository not ready.");
    return;
  }

  const control = {
    isStopped: () => host.agentControlRef.current.stopped,
    isPaused: () => host.agentControlRef.current.paused,
    waitForApproval: () =>
      new Promise<boolean>((resolve) => {
        host.agentControlRef.current.approveResolve = resolve;
      }),
    delay: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    onSessionUpdate: (s: AgentLoopSession) => {
      host.setAgentLoopSession(s);
    },
    onReasoningFeed: (input: {
      thought: string;
      reason: string;
      action: string;
      result: string | null;
      ok: boolean;
    }) => {
      host.pushAgent((s) =>
        appendAgentReasoning(s, {
          thought: input.thought,
          reason: input.reason,
          action: input.action,
          result: input.result,
          ok: input.ok,
        }),
      );
    },
  };

  const llmDecide = host.api
    ? createLlmDecideNextAction(async (prompt) => {
        try {
          const settings = normalizeProviderSettings(
            await host.api!.getProviderSettings(),
          );
          const res = await host.api!.agentStepWithProvider(
            settings.provider,
            prompt,
          );
          return {
            ok: res.ok,
            text: res.text,
            ...(res.nativeArgs !== undefined ? { nativeArgs: res.nativeArgs } : {}),
            ...(res.error !== undefined ? { error: res.error } : {}),
          };
        } catch (err) {
          return {
            ok: false,
            text: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    : null;

  const final = await runAgentLoop(initial, act, control, {
    ...(llmDecide ? { decideNextAction: llmDecide } : {}),
  });
  host.setAgentLoopSession(final);

  if (final.status === "completed") {
    host.pushAgent((s) => {
      let n = setAgentStatus(s, "completed");
      n = appendAgentFeed(
        n,
        "completed",
        `${BRYANTLABS_AGENT_DISPLAY_NAME} finished`,
        final.flags.completionSummary ?? final.goal,
      );
      n = setTimelineStage(n, "complete", "done");
      return n;
    });
    host.finishStudioAction(
      "studio_agent",
      "studio_agent",
      true,
      `${BRYANTLABS_AGENT_DISPLAY_NAME} completed`,
      final.flags.completionSummary
        ? { details: final.flags.completionSummary }
        : undefined,
    );
  } else if (final.status === "failed" || final.status === "stopped") {
    host.finishStudioAction(
      "studio_agent",
      "studio_agent",
      false,
      `${BRYANTLABS_AGENT_DISPLAY_NAME} ${final.status}`,
    );
  }
}

export async function startAgentOrchestration(
  host: AgentOrchestrationHost | null,
  goalPrompt: string,
): Promise<void> {
  if (!host?.api) {
    host?.setAgentLoopError("Studio API is not available.");
    return;
  }
  const trimmed = goalPrompt.trim();
  const gate = getAgentStartGate({
    projectOpen: Boolean(host.project),
    scan: host.scan,
    scanStatus: host.scanStatus,
    repository: host.repository,
    goalPrompt: trimmed,
  });
  if (gate.blocked) {
    host.setAgentLoopError(gate.reason);
    // Greenfield is handled by the main Agent composer — no separate New App rail.
    return;
  }
  if (!host.project || !host.scan || !host.repository) {
    host.setAgentLoopError(NO_PROJECT_FILES_MESSAGE);
    return;
  }
  host.setAgentLoopError(null);
  host.agentControlRef.current = {
    paused: false,
    stopped: false,
    safetyApproved: false,
    approveResolve: null,
  };
  host.agentLastExecRef.current = null;

  let session = createAgentLoopSession(trimmed);

  const semanticBoostPaths = await resolvePlannerSemanticBoostPaths(
    host.api,
    trimmed,
    host.scan,
  );
  const explored = await exploreRepositoryBeforeEdit({
    api: host.api,
    projectRoot: host.project.path,
    repository: host.repository,
    prompt: trimmed,
    semanticBoostPaths,
  });
  if (explored.length > 0) {
    host.editExplorationContentsRef.current = explored;
    const readFileContents = Object.fromEntries(
      explored.map((entry) => [entry.path, entry.content]),
    );
    const readPaths = explored.map((entry) => entry.path);
    session = patchAgentFlags(session, { readPaths, readFileContents });
    session = {
      ...session,
      observations: [
        ...session.observations,
        `Pre-explored ${explored.length} file(s): ${readPaths.join(", ")}`,
      ],
    };
  }

  host.setAgentLoopSession(session);
  host.setRailTool("agent");

  host.pushAgent((s) => {
    let n = startAgentSession(s, trimmed);
    n = patchAgentContext(n, { goal: trimmed, phase: null, task: null });
    n = appendAgentFeed(
      n,
      "thinking",
      `${BRYANTLABS_AGENT_DISPLAY_NAME} started`,
      trimmed,
    );
    n = appendAgentHistory(n, "prompt", "Agent goal", trimmed);
    n = setTimelineStage(n, "plan", "active");
    return n;
  });

  host.beginStudioAction(
    "studio_agent",
    "studio_agent",
    `${BRYANTLABS_AGENT_DISPLAY_NAME} started`,
    {
      details: trimmed,
      patch: { workflow: { prompt: trimmed } },
    },
  );

  await runAgentOrchestratorOrchestration(host, session);
}

export function pauseAgentOrchestration(
  host: AgentOrchestrationHost | null,
): void {
  if (!host) return;
  host.agentControlRef.current.paused = true;
  host.setAgentLoopSession((prev) =>
    prev && prev.status === "running" ? { ...prev, status: "paused" } : prev,
  );
  host.pushAgent((s) => appendAgentFeed(s, "thinking", "Agent paused", null));
}

export async function resumeAgentOrchestration(
  host: AgentOrchestrationHost | null,
): Promise<void> {
  if (!host?.agentLoopSession) return;
  host.agentControlRef.current.paused = false;
  host.pushAgent((s) => {
    let n = setAgentStatus(s, "active");
    return appendAgentFeed(n, "thinking", "Agent resumed", null);
  });
  const session =
    host.agentLoopSession.status === "paused"
      ? { ...host.agentLoopSession, status: "running" as const }
      : host.agentLoopSession;
  host.setAgentLoopSession(session);
  await runAgentOrchestratorOrchestration(host, session);
}

export function stopAgentOrchestration(
  host: AgentOrchestrationHost | null,
): void {
  if (!host) return;
  host.agentControlRef.current.stopped = true;
  host.agentControlRef.current.paused = false;
  const resolve = host.agentControlRef.current.approveResolve;
  if (resolve) {
    resolve(false);
    host.agentControlRef.current.approveResolve = null;
  }
  host.setAgentLoopSession((prev) =>
    prev ? { ...prev, status: "stopped", endedAt: Date.now() } : prev,
  );
  host.pushAgent((s) => {
    let n = setAgentStatus(s, "stopped");
    return appendAgentFeed(n, "completed", "Agent stopped", null);
  });
}

export async function approveAgentActionOrchestration(
  host: AgentOrchestrationHost | null,
): Promise<void> {
  if (
    !host?.agentLoopSession ||
    host.agentLoopSession.status !== "awaiting_approval"
  ) {
    return;
  }
  host.agentControlRef.current.safetyApproved = true;
  const resolve = host.agentControlRef.current.approveResolve;
  if (resolve) {
    resolve(true);
    host.agentControlRef.current.approveResolve = null;
  }
  const session: AgentLoopSession = {
    ...host.agentLoopSession,
    status: "running",
    pendingApproval: null,
  };
  host.setAgentLoopSession(session);
  await runAgentOrchestratorOrchestration(host, session);
}
