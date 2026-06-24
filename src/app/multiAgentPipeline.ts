import type { PipelineSession } from "@/core/pipeline/types";
import {
  cancelPipelineSession,
  completePipelineSession,
  createPipelineSession,
  finishPipelineStage,
  getPipelineStage,
  pipelineRunLogMessage,
  skipPipelineStage,
  startPipelineStage,
} from "@/core/pipeline/stateMachine";
import { plannerOutputFromAiPlan } from "@/core/pipeline/plannerOutput";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { ProviderId } from "@/core/providers/types";
import type { VerificationResult } from "@/types";

export interface PipelineRunnerDeps {
  readonly log: (
    stage:
      | "pipeline"
      | "pipeline_planner"
      | "pipeline_coder"
      | "pipeline_verifier"
      | "pipeline_repair"
      | "pipeline_complete",
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => void;
  readonly onSessionUpdate: (session: PipelineSession) => void;
  readonly runPlanner: (prompt: string) => Promise<{
    result: AIPlanResult | null;
    contextSnapshotId: string | null;
    routing: { provider: ProviderId; model: string };
  }>;
  readonly runCoderPropose: (prompt: string) => Promise<{
    ok: boolean;
    error?: string;
    contextSnapshotId: string | null;
    routing: { provider: ProviderId; model: string };
    fileCount: number;
  }>;
  readonly runApplyAndVerify: () => Promise<{
    ok: boolean;
    verification: VerificationResult | null;
    applied: readonly string[];
    error?: string;
  }>;
  readonly runRepair: (input: {
    verification: VerificationResult;
    applied: readonly string[];
    prompt: string;
    planSummary: string;
    planSource: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    verification: VerificationResult | null;
    awaitingApproval?: boolean;
    routing: { provider: ProviderId; model: string };
  }>;
  readonly awaitReviewApproval: () => Promise<boolean>;
  readonly awaitRepairApproval: () => Promise<boolean>;
  readonly getMaxRepairAttempts: () => number;
}

type PipelineEmit = (session: PipelineSession) => PipelineSession;

function createEmit(deps: PipelineRunnerDeps): PipelineEmit {
  return (session) => {
    deps.onSessionUpdate(session);
    return session;
  };
}

function patchRouting(
  session: PipelineSession,
  stageId: PipelineSession["stages"][number]["id"],
  routing: { provider: ProviderId; model: string },
): PipelineSession {
  return {
    ...session,
    stages: session.stages.map((s) =>
      s.id === stageId
        ? { ...s, provider: routing.provider, model: routing.model }
        : s,
    ),
  };
}

type ResumePhase = "planner" | "coder" | "review" | "verify_loop" | "complete";

export function resolvePipelineResumePhase(session: PipelineSession): ResumePhase {
  if (session.status === "completed") return "complete";
  if (session.status === "awaiting_review") return "review";
  if (session.status === "verifying" || session.status === "repairing") {
    return "verify_loop";
  }

  const planner = getPipelineStage(session, "planner");
  const coder = getPipelineStage(session, "coder");
  const plannerDone =
    planner?.status === "success" && session.plannerOutput != null;
  const coderDone = coder?.status === "success";

  if (coderDone) {
    return session.status === "coding" ? "review" : "verify_loop";
  }

  if (session.status === "coding" || coder?.status === "running") {
    return "coder";
  }

  if (plannerDone) {
    return "coder";
  }

  return "planner";
}

async function runPlannerPhase(
  session: PipelineSession,
  prompt: string,
  deps: PipelineRunnerDeps,
  emit: PipelineEmit,
): Promise<{ session: PipelineSession; ok: boolean }> {
  let current = emit(
    startPipelineStage(session, "planner", { provider: "gemini", model: "" }),
  );
  deps.log(
    "pipeline_planner",
    "running",
    pipelineRunLogMessage("planner", "running"),
  );
  const planner = await deps.runPlanner(prompt);
  current = emit(patchRouting(current, "planner", planner.routing));
  if (!planner.result?.ok || !planner.result.plan) {
    current = emit(
      finishPipelineStage(current, "planner", false, "Planner failed", {
        error: planner.result?.error ?? planner.result?.parseError ?? "No plan",
      }),
    );
    deps.log(
      "pipeline_planner",
      "failed",
      pipelineRunLogMessage("planner", "failed"),
    );
    current = emit(completePipelineSession(current, false));
    deps.log("pipeline", "failed", pipelineRunLogMessage("pipeline", "failed"));
    return { session: current, ok: false };
  }
  const output = plannerOutputFromAiPlan(prompt, planner.result);
  current = emit({
    ...finishPipelineStage(current, "planner", true, output?.summary ?? "Plan ready", {
      ...(planner.contextSnapshotId
        ? { contextSnapshotId: planner.contextSnapshotId }
        : {}),
    }),
    plannerOutput: output,
  });
  deps.log(
    "pipeline_planner",
    "success",
    pipelineRunLogMessage("planner", "success"),
    output?.summary,
  );
  return { session: current, ok: true };
}

async function runCoderPhase(
  session: PipelineSession,
  prompt: string,
  deps: PipelineRunnerDeps,
  emit: PipelineEmit,
): Promise<{ session: PipelineSession; ok: boolean }> {
  let current = emit(
    startPipelineStage(session, "coder", { provider: "gemini", model: "" }),
  );
  deps.log(
    "pipeline_coder",
    "running",
    pipelineRunLogMessage("coder", "running"),
  );
  const coder = await deps.runCoderPropose(prompt);
  current = emit(patchRouting(current, "coder", coder.routing));
  if (!coder.ok) {
    current = emit(
      finishPipelineStage(current, "coder", false, "Coder failed", {
        error: coder.error ?? "Propose failed",
      }),
    );
    deps.log(
      "pipeline_coder",
      "failed",
      pipelineRunLogMessage("coder", "failed"),
    );
    current = emit(completePipelineSession(current, false));
    deps.log("pipeline", "failed", pipelineRunLogMessage("pipeline", "failed"));
    return { session: current, ok: false };
  }
  current = emit(
    finishPipelineStage(
      current,
      "coder",
      true,
      `${coder.fileCount} patch proposal(s) ready for review`,
      {
        ...(coder.contextSnapshotId
          ? { contextSnapshotId: coder.contextSnapshotId }
          : {}),
      },
    ),
  );
  deps.log(
    "pipeline_coder",
    "success",
    pipelineRunLogMessage("coder", "success"),
  );
  return { session: current, ok: true };
}

async function runReviewPhase(
  session: PipelineSession,
  deps: PipelineRunnerDeps,
  emit: PipelineEmit,
): Promise<{ session: PipelineSession; ok: boolean }> {
  let current = emit({ ...session, status: "awaiting_review" });
  const reviewApproved = await deps.awaitReviewApproval();
  if (!reviewApproved) {
    current = emit(cancelPipelineSession(current));
    deps.log("pipeline", "failed", "[pipeline] cancelled at review");
    return { session: current, ok: false };
  }
  return { session: current, ok: true };
}

async function runVerifyRepairLoop(
  session: PipelineSession,
  prompt: string,
  deps: PipelineRunnerDeps,
  emit: PipelineEmit,
): Promise<PipelineSession> {
  let current = session;
  const output = session.plannerOutput;
  const maxRepairs = deps.getMaxRepairAttempts();
  let repairAttempts = session.repairAttempts;
  let planSummary = output?.summary ?? "";
  const planSource = "ai_plan";

  while (true) {
    current = emit(
      startPipelineStage(current, "verifier", {
        provider: "local",
        model: "local",
      }),
    );
    deps.log(
      "pipeline_verifier",
      "running",
      pipelineRunLogMessage("verifier", "running"),
    );

    const apply = await deps.runApplyAndVerify();
    if (apply.ok && apply.verification) {
      current = emit(
        finishPipelineStage(current, "verifier", true, "Verification passed"),
      );
      current = emit({ ...current, verification: apply.verification });
      deps.log(
        "pipeline_verifier",
        "success",
        pipelineRunLogMessage("verifier", "success"),
      );
      if (repairAttempts === 0) {
        current = emit(skipPipelineStage(current, "repair", "Not needed"));
      }
      break;
    }

    current = emit(
      finishPipelineStage(current, "verifier", false, "Verification failed", {
        error: apply.error ?? "Verification failed",
      }),
    );
    deps.log(
      "pipeline_verifier",
      "failed",
      pipelineRunLogMessage("verifier", "failed"),
      apply.error,
    );

    if (repairAttempts >= maxRepairs) {
      current = emit(completePipelineSession(current, false));
      deps.log("pipeline", "failed", pipelineRunLogMessage("pipeline", "failed"));
      return current;
    }

    current = emit(
      startPipelineStage(current, "repair", { provider: "ollama", model: "" }),
    );
    deps.log(
      "pipeline_repair",
      "running",
      pipelineRunLogMessage("repair", "running"),
    );

    const repair = await deps.runRepair({
      verification: apply.verification!,
      applied: apply.applied,
      prompt,
      planSummary,
      planSource,
    });
    current = emit({
      ...patchRouting(current, "repair", repair.routing),
      repairAttempts: current.repairAttempts + 1,
    });
    repairAttempts = current.repairAttempts;

    if (repair.awaitingApproval) {
      const repairApproved = await deps.awaitRepairApproval();
      if (!repairApproved) {
        current = emit(
          finishPipelineStage(current, "repair", false, "Repair cancelled", {
            error: "Repair approval cancelled",
          }),
        );
        current = emit(cancelPipelineSession(current));
        deps.log("pipeline", "failed", "[pipeline] cancelled at repair");
        return current;
      }
    }

    if (!repair.ok) {
      current = emit(
        finishPipelineStage(current, "repair", false, "Repair failed", {
          error: repair.error ?? "Repair failed",
        }),
      );
      deps.log(
        "pipeline_repair",
        "failed",
        pipelineRunLogMessage("repair", "failed"),
      );
      current = emit(completePipelineSession(current, false));
      deps.log("pipeline", "failed", pipelineRunLogMessage("pipeline", "failed"));
      return current;
    }

    current = emit(finishPipelineStage(current, "repair", true, "Repair applied"));
    deps.log(
      "pipeline_repair",
      "success",
      pipelineRunLogMessage("repair", "success"),
    );

    if (repair.verification) {
      current = emit(
        finishPipelineStage(
          current,
          "verifier",
          true,
          "Verification passed after repair",
        ),
      );
      current = emit({ ...current, verification: repair.verification });
      deps.log(
        "pipeline_verifier",
        "success",
        pipelineRunLogMessage("verifier", "success"),
      );
      break;
    }
  }

  current = emit(finishPipelineStage(current, "complete", true, "Pipeline completed"));
  current = emit(completePipelineSession(current, true));
  deps.log(
    "pipeline_complete",
    "success",
    pipelineRunLogMessage("pipeline", "completed"),
  );
  deps.log("pipeline", "success", pipelineRunLogMessage("pipeline", "completed"));
  return current;
}

async function runPipelineFromPhase(
  session: PipelineSession,
  startPhase: ResumePhase,
  deps: PipelineRunnerDeps,
  emit: PipelineEmit,
): Promise<PipelineSession> {
  const prompt = session.prompt;
  let current = session;

  if (startPhase === "complete") {
    return current;
  }

  if (startPhase === "planner") {
    const planner = await runPlannerPhase(current, prompt, deps, emit);
    current = planner.session;
    if (!planner.ok) return current;
    startPhase = "coder";
  }

  if (startPhase === "coder") {
    const coder = await runCoderPhase(current, prompt, deps, emit);
    current = coder.session;
    if (!coder.ok) return current;
    startPhase = "review";
  }

  if (startPhase === "review") {
    const review = await runReviewPhase(current, deps, emit);
    current = review.session;
    if (!review.ok) return current;
    startPhase = "verify_loop";
  }

  if (startPhase === "verify_loop") {
    return runVerifyRepairLoop(current, prompt, deps, emit);
  }

  return current;
}

export async function executeMultiAgentPipeline(
  prompt: string,
  deps: PipelineRunnerDeps,
): Promise<PipelineSession> {
  const emit = createEmit(deps);
  let session = emit(createPipelineSession(prompt));
  deps.log("pipeline", "running", pipelineRunLogMessage("pipeline", "started"));
  return runPipelineFromPhase(session, "planner", deps, emit);
}

export async function resumeMultiAgentPipeline(
  session: PipelineSession,
  deps: PipelineRunnerDeps,
): Promise<PipelineSession> {
  const emit = createEmit(deps);
  const phase = resolvePipelineResumePhase(session);
  deps.log(
    "pipeline",
    "running",
    `[pipeline] resumed at ${phase}`,
    session.status,
  );
  return runPipelineFromPhase(session, phase, deps, emit);
}
