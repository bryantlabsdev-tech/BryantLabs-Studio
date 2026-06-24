import type { AgentRunCardViewModel, AgentRunStepStatus } from "@/core/agent/agentRunCard";
import type { BuildLoopPhase } from "@/core/build/types";
import type { PlanApplySession } from "@/core/planApply/types";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";

export type OperationalStepId =
  | "understanding"
  | "scanning"
  | "selecting_files"
  | "building_plan"
  | "generating_changes"
  | "validating_patches"
  | "applying_changes"
  | "verification"
  | "preparing_review"
  | "completed"
  | "failed";

export type OperationalStepStatus = "pending" | "active" | "complete" | "failed";

export interface OperationalActivityStep {
  readonly id: OperationalStepId;
  readonly label: string;
  readonly description: string;
  readonly status: OperationalStepStatus;
  readonly startedAt: number | null;
  readonly elapsedMs: number | null;
  readonly metadata: readonly string[];
}

export type PlanPreviewPhase =
  | "waiting"
  | "planning"
  | "files_selected"
  | "changes_proposed"
  | "verification_running"
  | "ready_for_review"
  | "completed"
  | "failed";

export interface DeriveOperationalActivityInput {
  readonly card: AgentRunCardViewModel;
  readonly buildPhase: BuildLoopPhase;
  readonly planApplySession: PlanApplySession | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly timeline: RunTimelineSnapshot | null;
  readonly runStartedAt: number | null;
  readonly nowMs?: number;
}

const STEP_DEFS: readonly {
  id: OperationalStepId;
  label: string;
  defaultDescription: string;
}[] = [
  { id: "understanding", label: "Understanding request", defaultDescription: "Reviewing your prompt and project context" },
  { id: "scanning", label: "Scanning repository", defaultDescription: "Indexing project files and structure" },
  { id: "selecting_files", label: "Selecting files", defaultDescription: "Choosing files relevant to your request" },
  { id: "building_plan", label: "Building plan", defaultDescription: "Creating an edit plan for the requested change" },
  { id: "generating_changes", label: "Generating changes", defaultDescription: "Drafting code updates with the AI provider" },
  { id: "validating_patches", label: "Validating patches", defaultDescription: "Checking proposed edits before apply" },
  { id: "applying_changes", label: "Applying changes", defaultDescription: "Writing updates to project files" },
  { id: "verification", label: "Running typecheck/build", defaultDescription: "Verifying the project still builds cleanly" },
  { id: "preparing_review", label: "Preparing review", defaultDescription: "Changes are ready for your approval" },
  { id: "completed", label: "Completed", defaultDescription: "Run finished successfully" },
  { id: "failed", label: "Failed", defaultDescription: "Run stopped before completion" },
];

function mapStepStatus(status: AgentRunStepStatus): OperationalStepStatus {
  if (status === "running" || status === "retrying") return "active";
  if (status === "success" || status === "skipped") return "complete";
  if (status === "failed") return "failed";
  return "pending";
}

function stageTime(
  timeline: RunTimelineSnapshot | null,
  stageIds: readonly string[],
): number | null {
  if (!timeline) return null;
  for (const id of stageIds) {
    const hit = timeline.stages.find((s) => s.stage === id);
    if (hit) return hit.at;
  }
  return null;
}

function elapsedSince(start: number | null, nowMs: number): number | null {
  if (start == null) return null;
  return Math.max(0, nowMs - start);
}

function cardStep(card: AgentRunCardViewModel, id: string) {
  return card.steps.find((s) => s.id === id) ?? null;
}

function resolveOperationalStatuses(input: DeriveOperationalActivityInput): Map<OperationalStepId, OperationalStepStatus> {
  const { card, buildPhase, planApplySession, scanStatus } = input;
  const statuses = new Map<OperationalStepId, OperationalStepStatus>();
  for (const def of STEP_DEFS) statuses.set(def.id, "pending");

  const understanding = cardStep(card, "understanding");
  const planning = cardStep(card, "planning");
  const editing = cardStep(card, "editing");
  const applying = cardStep(card, "applying");
  const typescript = cardStep(card, "typescript");
  const building = cardStep(card, "building");
  const complete = cardStep(card, "complete");

  if (understanding) statuses.set("understanding", mapStepStatus(understanding.status));
  if (scanStatus === "scanning") statuses.set("scanning", "active");
  else if (scanStatus === "done" || scanStatus === "error") statuses.set("scanning", "complete");

  if (planning) statuses.set("building_plan", mapStepStatus(planning.status));
  if (editing) {
    statuses.set("selecting_files", mapStepStatus(editing.status));
    statuses.set("generating_changes", mapStepStatus(editing.status));
  }

  const planPhase = planApplySession?.phase ?? null;
  if (planPhase === "proposing") {
    statuses.set("generating_changes", "active");
  }
  if (planPhase === "review" || planPhase === "waiting_for_review") {
    statuses.set("validating_patches", "complete");
    statuses.set("preparing_review", "active");
  }
  if (planPhase === "applying") {
    statuses.set("applying_changes", "active");
  }
  if (planPhase === "verifying") {
    statuses.set("verification", "active");
  }
  if (planPhase === "done") {
    statuses.set("applying_changes", "complete");
  }

  if (applying) {
    statuses.set("validating_patches", mapStepStatus(applying.status));
    statuses.set("applying_changes", mapStepStatus(applying.status));
  }

  const verifyRunning =
    typescript?.status === "running" ||
    building?.status === "running" ||
    buildPhase === "verifying";
  const verifyFailed = typescript?.status === "failed" || building?.status === "failed";
  const verifyDone =
    (typescript?.status === "success" || typescript?.status === "skipped") &&
    (building?.status === "success" || building?.status === "skipped");

  if (verifyRunning) statuses.set("verification", "active");
  else if (verifyFailed) statuses.set("verification", "failed");
  else if (verifyDone) statuses.set("verification", "complete");

  if (buildPhase === "review") statuses.set("preparing_review", "active");

  if (complete?.status === "success") {
    statuses.set("completed", "complete");
  }

  if (card.overallStatus === "failed") {
    const activeStep = [...statuses.entries()].find(([, s]) => s === "active");
    if (activeStep) statuses.set(activeStep[0], "failed");
    else statuses.set("failed", "active");
  } else if (card.overallStatus === "complete") {
    statuses.set("completed", "complete");
  }

  // Propagate completion forward: earlier steps complete when later ones start
  const order = STEP_DEFS.map((s) => s.id);
  let seenActive = false;
  for (const id of order) {
    if (id === "failed") continue;
    const status = statuses.get(id) ?? "pending";
    if (status === "active") {
      seenActive = true;
      continue;
    }
    if (seenActive && status === "pending") continue;
    if (!seenActive && status === "complete") continue;
  }

  // Mark prior steps complete when a later step is active/complete
  let highestReached = -1;
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i]!;
    if (id === "failed") continue;
    const status = statuses.get(id) ?? "pending";
    if (status === "active" || status === "complete" || status === "failed") {
      highestReached = i;
    }
  }
  for (let i = 0; i < highestReached; i += 1) {
    const id = order[i]!;
    if (id === "failed") continue;
    const status = statuses.get(id) ?? "pending";
    if (status === "pending") statuses.set(id, "complete");
  }

  return statuses;
}

function descriptionForStep(
  id: OperationalStepId,
  input: DeriveOperationalActivityInput,
  status: OperationalStepStatus,
): string {
  const def = STEP_DEFS.find((s) => s.id === id);
  if (status === "pending") return "Waiting for update.";
  if (status === "active" && id === "selecting_files") {
    const count =
      input.planApplySession?.files.length ??
      input.card.patchImpact.files.length ??
      input.card.filesPlanned.length;
    if (count > 0) return `Selected ${count} file${count === 1 ? "" : "s"} for this change`;
  }
  if (status === "active" && id === "generating_changes" && input.card.currentStep?.label) {
    return input.card.currentStep.label;
  }
  if (id === "failed" && input.card.failureDetails?.reasonLabel) {
    return input.card.failureDetails.reasonLabel;
  }
  return def?.defaultDescription ?? "Waiting for update.";
}

function metadataForStep(id: OperationalStepId, input: DeriveOperationalActivityInput): string[] {
  const meta: string[] = [];
  const { card } = input;
  if (id === "generating_changes" || id === "building_plan") {
    if (card.providerIdentityLine) meta.push(card.providerIdentityLine);
    else if (card.providerLine) meta.push(card.providerLine);
  }
  if (id === "selecting_files") {
    const count = input.planApplySession?.files.length ?? card.patchImpact.files.length;
    if (count > 0) meta.push(`${count} files`);
  }
  if (id === "verification") {
    const v = card.verification;
    if (v.typescript !== "pending") meta.push(`TS: ${v.typescript}`);
    if (v.build !== "pending") meta.push(`Build: ${v.build}`);
  }
  return meta;
}

function startedAtForStep(id: OperationalStepId, input: DeriveOperationalActivityInput): number | null {
  const { timeline, runStartedAt } = input;
  switch (id) {
    case "understanding":
      return stageTime(timeline, ["audit_start"]) ?? runStartedAt;
    case "scanning":
      return stageTime(timeline, ["audit_start"]) ?? runStartedAt;
    case "building_plan":
      return stageTime(timeline, ["plan_start"]);
    case "selecting_files":
      return stageTime(timeline, ["plan_complete", "coder_start"]);
    case "generating_changes":
      return stageTime(timeline, ["coder_start", "patch_generated"]);
    case "validating_patches":
      return stageTime(timeline, ["patch_generated"]);
    case "applying_changes":
      return stageTime(timeline, ["apply_start"]);
    case "verification":
      return stageTime(timeline, ["typescript_start", "build_start"]);
    case "preparing_review":
      return stageTime(timeline, ["waiting_for_review"]);
    case "completed":
      return stageTime(timeline, ["run_complete"]);
    default:
      return null;
  }
}

export function deriveAgentOperationalActivity(
  input: DeriveOperationalActivityInput,
): OperationalActivityStep[] {
  const nowMs = input.nowMs ?? Date.now();
  const statuses = resolveOperationalStatuses(input);
  const isTerminal =
    input.card.overallStatus === "complete" ||
    input.card.overallStatus === "failed" ||
    input.card.overallStatus === "cancelled";

  const visibleIds = STEP_DEFS.filter((def) => {
    if (def.id === "failed") return statuses.get("failed") === "active";
    if (def.id === "completed") return statuses.get("completed") === "complete" || isTerminal;
    const status = statuses.get(def.id) ?? "pending";
    return status !== "pending" || !isTerminal;
  }).map((d) => d.id);

  // During active runs show full pipeline; when idle terminal hide pending tail
  const ids =
    isTerminal
      ? visibleIds
      : STEP_DEFS.map((d) => d.id).filter((id) => id !== "failed" || statuses.get("failed") === "active");

  return ids.map((id) => {
    const def = STEP_DEFS.find((s) => s.id === id)!;
    const status = statuses.get(id) ?? "pending";
    const startedAt = startedAtForStep(id, input);
    const elapsedMs =
      status === "active" ? elapsedSince(startedAt, nowMs) : null;
    return {
      id,
      label: def.label,
      description: descriptionForStep(id, input, status),
      status,
      startedAt,
      elapsedMs,
      metadata: metadataForStep(id, input),
    };
  });
}

export function derivePlanPreviewPhase(input: DeriveOperationalActivityInput): PlanPreviewPhase {
  const { card, buildPhase, planApplySession } = input;

  if (card.overallStatus === "failed") return "failed";
  if (card.overallStatus === "complete") return "completed";

  if (buildPhase === "review" || planApplySession?.phase === "waiting_for_review" || planApplySession?.phase === "review") {
    return "ready_for_review";
  }
  if (buildPhase === "verifying" || planApplySession?.phase === "verifying") {
    return "verification_running";
  }
  if (
    planApplySession?.phase === "proposing" ||
    planApplySession?.files.some((f) => f.proposal || f.patchGenerated)
  ) {
    return "changes_proposed";
  }
  if (
    (planApplySession?.files.length ?? 0) > 0 ||
    card.patchImpact.files.length > 0 ||
    card.filesPlanned.length > 0
  ) {
    return "files_selected";
  }
  if (
    card.currentStep?.id === "planning" ||
    buildPhase === "planning" ||
    card.currentStep?.id === "understanding"
  ) {
    return "planning";
  }
  if (card.overallStatus === "running") return "waiting";
  return "waiting";
}

export const PLAN_PREVIEW_PHASE_LABELS: Record<PlanPreviewPhase, string> = {
  waiting: "Waiting",
  planning: "Planning",
  files_selected: "Files selected",
  changes_proposed: "Changes proposed",
  verification_running: "Verification running",
  ready_for_review: "Ready for review",
  completed: "Completed",
  failed: "Failed",
};

export function deriveFollowUpComposerState(input: {
  readonly lastOutcome: "success" | "failure" | "neutral" | null;
  readonly runActive: boolean;
  readonly awaitingReview: boolean;
  readonly hasProject: boolean;
}): {
  readonly mode: "idle" | "follow_up" | "continue_run";
  readonly headline: string | null;
  readonly placeholder: string;
  readonly suggestions: readonly string[];
} {
  if (input.runActive || input.awaitingReview) {
    return {
      mode: "idle",
      headline: null,
      placeholder: input.hasProject
        ? "Describe a change… Use @codebase, @src/App.tsx, or @SymbolName"
        : "Describe an app to build…",
      suggestions: [],
    };
  }

  if (input.lastOutcome === "success" && input.hasProject) {
    return {
      mode: "follow_up",
      headline: "Continue this conversation",
      placeholder: "Follow up on the last change…",
      suggestions: [
        "Now make it mobile friendly",
        "Fix the button spacing",
        "Add dark mode",
        "Undo the last change",
      ],
    };
  }

  return {
    mode: "idle",
    headline: null,
    placeholder: input.hasProject
      ? "Describe a change… Use @codebase, @src/App.tsx, or @SymbolName"
      : "Describe an app to build…",
    suggestions: [],
  };
}
