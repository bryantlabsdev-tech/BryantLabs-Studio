import type { IncompleteCoordinatedApply } from "@/core/planApply/coordinatedEditCompletion";
import type { PlanApplyPhase, PlanApplySession } from "@/core/planApply/types";

export type ApplyPlanTerminalKind =
  | "waiting_for_review"
  | "patch_applied"
  | "failed"
  | "canceled";

export interface ApplyPlanTerminal {
  readonly kind: ApplyPlanTerminalKind;
  readonly reason: string | null;
  readonly missingTargets: readonly string[];
  readonly clearSession: boolean;
}

const TERMINAL_PHASES = new Set<PlanApplyPhase>([
  "waiting_for_review",
  "done",
]);

export function isApplyPlanTerminalPhase(
  phase: PlanApplyPhase | null | undefined,
  applyError?: string | null,
): boolean {
  if (applyError?.trim()) return true;
  if (!phase) return false;
  return TERMINAL_PHASES.has(phase);
}

export function resolveApplyPlanSettlement(input: {
  readonly phase: PlanApplyPhase | null;
  readonly applyError?: string | null;
  readonly canceled?: boolean;
  readonly incomplete?: IncompleteCoordinatedApply | null;
  readonly validReady?: number;
}): ApplyPlanTerminal {
  if (input.canceled) {
    return {
      kind: "canceled",
      reason: "canceled",
      missingTargets: [],
      clearSession: true,
    };
  }

  if (input.incomplete?.incomplete) {
    return {
      kind: "failed",
      reason:
        input.incomplete.message ??
        "Incomplete patch batch — refusing write.",
      missingTargets: input.incomplete.missing,
      clearSession: true,
    };
  }

  if (input.applyError?.trim()) {
    return {
      kind: "failed",
      reason: input.applyError.trim(),
      missingTargets: [],
      clearSession: true,
    };
  }

  if (input.phase === "done") {
    return {
      kind: "patch_applied",
      reason: null,
      missingTargets: [],
      clearSession: true,
    };
  }

  if (
    input.phase === "waiting_for_review" ||
    (input.phase === "review" && (input.validReady ?? 0) > 0)
  ) {
    return {
      kind: "waiting_for_review",
      reason: null,
      missingTargets: [],
      clearSession: false,
    };
  }

  if (input.phase === "proposing" || input.phase === "idle" || !input.phase) {
    return {
      kind: "failed",
      reason: "Apply Plan ended without reaching a terminal state.",
      missingTargets: [],
      clearSession: true,
    };
  }

  return {
    kind: "failed",
    reason: "Apply Plan ended without reaching a terminal state.",
    missingTargets: [],
    clearSession: true,
  };
}

export interface ApplyPlanSettlementHost {
  readonly planApplySession: PlanApplySession | null;
  readonly setPlanApplySession: (
    session: PlanApplySession | null,
  ) => void;
  readonly setPlanApplyError: (error: string | null) => void;
  readonly finishStudioAction?: (
    kind: "apply_plan",
    actionType: "apply_plan",
    ok: boolean,
    label: string,
    extras?: { details?: string },
  ) => void;
  readonly releaseBuildRunForReview?: () => void;
}

/** If the session is still proposing, finalize a typed failure and clear it. */
export function settleAbandonedApplyPlan(
  host: ApplyPlanSettlementHost,
  reason = "Apply Plan ended without reaching a terminal state.",
): ApplyPlanTerminal | null {
  const session = host.planApplySession;
  if (!session) return null;
  if (isApplyPlanTerminalPhase(session.phase, session.applyError)) {
    return null;
  }
  if (session.phase !== "proposing" && session.phase !== "idle") {
    return null;
  }
  const terminal = resolveApplyPlanSettlement({
    phase: session.phase,
    applyError: reason,
  });
  host.setPlanApplyError(terminal.reason);
  if (terminal.clearSession) {
    host.setPlanApplySession(null);
  }
  host.finishStudioAction?.(
    "apply_plan",
    "apply_plan",
    false,
    terminal.reason ?? reason,
    { details: terminal.reason ?? reason },
  );
  host.releaseBuildRunForReview?.();
  return terminal;
}

export function settleIncompleteCoordinatedApply(
  host: ApplyPlanSettlementHost,
  incomplete: IncompleteCoordinatedApply,
): ApplyPlanTerminal {
  const terminal = resolveApplyPlanSettlement({
    phase: host.planApplySession?.phase ?? "proposing",
    incomplete,
  });
  host.setPlanApplyError(terminal.reason);
  if (terminal.clearSession) {
    host.setPlanApplySession(null);
  }
  host.finishStudioAction?.(
    "apply_plan",
    "apply_plan",
    false,
    terminal.reason ?? "Incomplete patch batch",
    {
      details: [
        terminal.reason,
        terminal.missingTargets.length > 0
          ? `missing=${terminal.missingTargets.join(",")}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  );
  host.releaseBuildRunForReview?.();
  return terminal;
}
