import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { PipelineSession } from "@/core/pipeline/types";
import { readFollowUpReviewFirst } from "@/core/build/followUpPrefs";
import type { BuildLoopMode, BuildLoopStatus } from "@/core/build";
import { PipelineReviewGates } from "@/app/orchestration/pipelineGates";
import {
  computeBuildStatus,
  resumeBuildReviewOrchestration,
  runSingleAgentBuildLoop,
} from "@/app/orchestration/buildLoop";
import {
  resumeMultiAgentPipelineOrchestration,
  runMultiAgentPipelineOrchestration,
} from "@/app/orchestration/pipelineRunner";
import type { AIPlanStatus, BuildPipelineHost } from "@/app/orchestration/types";
import type { AutoFixSession } from "@/core/autoFix";
import type { PlanApplySession } from "@/core/planApply";

export interface BuildPhaseInputs {
  readonly aiPlanStatus: AIPlanStatus;
  readonly planApplyPhase: PlanApplySession["phase"] | null;
  readonly autoFixPhase: AutoFixSession["phase"] | null;
  readonly lastPlanPrompt: string | null;
  readonly planApplySession: PlanApplySession | null;
}

export function useBuildPipelineOrchestration(
  hostRef: MutableRefObject<BuildPipelineHost | null>,
  phaseInputs: BuildPhaseInputs,
) {
  const gatesRef = useRef(new PipelineReviewGates());
  const pipelineRunActiveRef = useRef(false);
  const buildRunActiveRef = useRef(false);
  const activeRunPromptRef = useRef<string | null>(null);

  const tryAcquireRun = useCallback((prompt: string): boolean => {
    if (buildRunActiveRef.current || pipelineRunActiveRef.current) {
      return false;
    }
    buildRunActiveRef.current = true;
    activeRunPromptRef.current = prompt.trim();
    return true;
  }, []);

  const releaseRun = useCallback(() => {
    buildRunActiveRef.current = false;
    if (!pipelineRunActiveRef.current) {
      activeRunPromptRef.current = null;
    }
  }, []);

  const [pipelineSession, setPipelineSession] = useState<PipelineSession | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [buildRunning, setBuildRunning] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState<BuildLoopMode>("single");

  const runMultiAgentPipeline = useCallback(async (prompt: string) => {
    if (pipelineRunActiveRef.current || buildRunActiveRef.current) {
      if (activeRunPromptRef.current === prompt.trim()) return;
      hostRef.current?.appendGreenfieldRunLog(
        "pipeline",
        "failed",
        "Pipeline already running — duplicate start ignored",
      );
      return;
    }
    pipelineRunActiveRef.current = true;
    activeRunPromptRef.current = prompt.trim();
    try {
      await runMultiAgentPipelineOrchestration(prompt, hostRef.current, gatesRef.current, {
        setPipelineError,
        setPipelineRunning,
        setPipelineSession,
        setRailTool: (tool) => hostRef.current?.setRailTool(tool),
        onRunActiveChange: (active) => {
          pipelineRunActiveRef.current = active;
          if (!active && !buildRunActiveRef.current) {
            activeRunPromptRef.current = null;
          }
        },
      });
    } finally {
      pipelineRunActiveRef.current = false;
      if (!buildRunActiveRef.current) {
        activeRunPromptRef.current = null;
      }
    }
  }, [hostRef]);

  const continueMultiAgentPipeline = useCallback(() => {
    gatesRef.current.continueReview();
  }, []);

  const continueMultiAgentPipelineRepair = useCallback(async () => {
    await hostRef.current?.approveAutoFixRepair();
    gatesRef.current.continueRepair();
  }, [hostRef]);

  const cancelMultiAgentPipeline = useCallback(() => {
    gatesRef.current.cancel(setPipelineSession, () => {
      pipelineRunActiveRef.current = false;
      setPipelineRunning(false);
      hostRef.current?.appendGreenfieldRunLog("pipeline", "failed", "[pipeline] cancelled");
    });
  }, [hostRef]);

  const runBuildLoop = useCallback(
    async (prompt: string) => {
      const host = hostRef.current;
      if (!tryAcquireRun(prompt)) {
        host?.appendGreenfieldRunLog(
          "pipeline",
          "failed",
          "Run already in progress — duplicate start ignored",
        );
        return;
      }
      try {
        await runSingleAgentBuildLoop(prompt, host, {
          setBuildRunning,
          setBuildError,
          setBuildMode,
          setCenterTab: (tab) => host?.setCenterTab(tab),
          setRailTool: (tool) => host?.setRailTool(tool),
          appendGreenfieldRunLog: (...args) => host?.appendGreenfieldRunLog(...args),
          runPipeline: runMultiAgentPipeline,
          refreshProviderStatus: () => host?.refreshProviderStatus?.() ?? Promise.resolve(),
        });
      } finally {
        releaseRun();
      }
    },
    [hostRef, releaseRun, runMultiAgentPipeline, tryAcquireRun],
  );

  const continueBuildAfterReview = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    if (buildMode === "pipeline") {
      host.approveAllPlanApplyFiles();
      continueMultiAgentPipeline();
      return;
    }
    host.approveAllPlanApplyFiles();
    setBuildRunning(true);
    setBuildError(null);
    try {
      const result = await host.applyApprovedPlanFiles();
      if (!result.ok) {
        setBuildError(result.error ?? "Apply failed.");
      }
    } finally {
      setBuildRunning(false);
    }
  }, [hostRef, buildMode, continueMultiAgentPipeline]);

  const cancelBuildLoop = useCallback(() => {
    if (pipelineRunning || pipelineSession) {
      cancelMultiAgentPipeline();
    }
    if (phaseInputs.planApplySession) {
      hostRef.current?.cancelApplyPlan();
    }
    setBuildRunning(false);
    setBuildError(null);
  }, [
    hostRef,
    phaseInputs.planApplySession,
    pipelineRunning,
    pipelineSession,
    cancelMultiAgentPipeline,
  ]);

  const retryApplyPlanReview = useCallback(async () => {
    const host = hostRef.current;
    if (!host?.executeApplyPlan) return;
    const reviewFirst = readFollowUpReviewFirst();
    setBuildRunning(true);
    setBuildError(null);
    host.cancelApplyPlan();
    let waitingForReview = false;
    try {
      const result = await host.executeApplyPlan({
        directRewrite: false,
        autoContinue: !reviewFirst,
      });
      waitingForReview = Boolean(result.waitingForReview);
      if (waitingForReview) {
        host.releaseBuildRunForReview?.();
        host.setCenterTab("diff");
      } else if (result.error) {
        setBuildError(result.error);
      }
    } finally {
      if (!waitingForReview) {
        setBuildRunning(false);
      }
    }
  }, [hostRef]);

  const buildStatus = useMemo<BuildLoopStatus>(
    () =>
      computeBuildStatus({
        mode: buildMode,
        buildRunning,
        pipelineRunning,
        pipelineStatus: pipelineSession?.status ?? null,
        aiPlanStatus: phaseInputs.aiPlanStatus,
        planApplyPhase: phaseInputs.planApplyPhase,
        autoFixPhase: phaseInputs.autoFixPhase,
        lastPlanPrompt: phaseInputs.lastPlanPrompt,
        pipelinePrompt: pipelineSession?.prompt ?? null,
        buildError,
        pipelineError,
      }),
    [
      buildMode,
      buildRunning,
      pipelineRunning,
      pipelineSession,
      phaseInputs.aiPlanStatus,
      phaseInputs.planApplyPhase,
      phaseInputs.autoFixPhase,
      phaseInputs.lastPlanPrompt,
      buildError,
      pipelineError,
    ],
  );

  const restorePipelineCheckpoint = useCallback(
    (session: PipelineSession | null, mode?: BuildLoopMode) => {
      setPipelineSession(session);
      setPipelineRunning(false);
      setPipelineError(null);
      pipelineRunActiveRef.current = false;
      if (mode) setBuildMode(mode);
    },
    [],
  );

  const resumeMultiAgentPipeline = useCallback(
    async (session: PipelineSession) => {
      await resumeMultiAgentPipelineOrchestration(session, hostRef.current, gatesRef.current, {
        setPipelineError,
        setPipelineRunning,
        setPipelineSession,
        setRailTool: (tool) => hostRef.current?.setRailTool(tool),
        onRunActiveChange: (active) => {
          pipelineRunActiveRef.current = active;
        },
      });
    },
    [hostRef],
  );

  const resumeBuildReview = useCallback(
    async (planApplySession: PlanApplySession) => {
      await resumeBuildReviewOrchestration(hostRef.current, planApplySession, {
        setBuildRunning,
        setBuildError,
        continueBuildAfterReview,
      });
    },
    [hostRef, continueBuildAfterReview],
  );

  const releaseBuildRunForReview = useCallback(() => {
    setBuildRunning(false);
  }, []);

  return {
    pipelineSession,
    pipelineRunning,
    pipelineError,
    pipelineRunActiveRef,
    buildRunning,
    buildError,
    buildMode,
    buildStatus,
    runMultiAgentPipeline,
    continueMultiAgentPipeline,
    continueMultiAgentPipelineRepair,
    cancelMultiAgentPipeline,
    runBuildLoop,
    continueBuildAfterReview,
    cancelBuildLoop,
    retryApplyPlanReview,
    restorePipelineCheckpoint,
    resumeMultiAgentPipeline,
    resumeBuildReview,
    setBuildError,
    releaseBuildRunForReview,
  };
}
