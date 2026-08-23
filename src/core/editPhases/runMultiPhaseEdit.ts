import {
  EDIT_PHASE_TIMING_MS,
  MAX_PHASE_REPAIR_ATTEMPTS,
  type EditPhasePlan,
  type EditPhaseSpec,
} from "@/core/editPhases/types";
import {
  firstIncompletePhase,
  markPhaseStatus,
  remainingPhases,
} from "@/core/editPhases/planPhases";
import {
  deferDiscoveredDependencies,
  evaluatePhasePatchCompleteness,
  type ProposedPhasePatch,
} from "@/core/editPhases/patchCompleteness";
import {
  applyPhaseTransactionally,
  type StagedPhaseFile,
} from "@/core/editPhases/transactionalApply";
import {
  cancelBetweenPhases,
  pausePlanForCredits,
  saveEditPhaseCheckpointLocal,
} from "@/core/editPhases/persistence";
import type { BryantLabsApi, VerificationResult } from "@/types";

export interface MultiPhaseEditHost {
  readonly api: BryantLabsApi;
  readonly projectPath: string;
  readonly appendLog?: (message: string, details?: string) => void;
  readonly onPlanUpdate?: (plan: EditPhasePlan) => void;
  readonly proposePhasePatches: (phase: EditPhaseSpec) => Promise<{
    patches: ProposedPhasePatch[];
    rawText: string | null;
    creditError?: string | null;
    truncated?: boolean;
  }>;
  readonly verifyFast: () => Promise<VerificationResult | { error: string }>;
  readonly verifyFull: () => Promise<VerificationResult | { error: string }>;
  readonly repairPhase?: (
    phase: EditPhaseSpec,
    diagnostics: string,
  ) => Promise<{
    patches: ProposedPhasePatch[];
    rawText: string | null;
    creditError?: string | null;
  }>;
  readonly isCancelled?: () => boolean;
  readonly buildStagedFiles: (
    phase: EditPhaseSpec,
    patches: readonly ProposedPhasePatch[],
  ) => Promise<StagedPhaseFile[]>;
}

export interface MultiPhaseEditResult {
  readonly ok: boolean;
  readonly plan: EditPhasePlan;
  readonly error: string | null;
  readonly providerCalls: number;
  readonly repairAttempts: number;
}

function publish(host: MultiPhaseEditHost, plan: EditPhasePlan): EditPhasePlan {
  saveEditPhaseCheckpointLocal(host.projectPath, plan);
  host.onPlanUpdate?.(plan);
  return plan;
}

function verificationFailed(
  result: VerificationResult | { error: string },
): string | null {
  if ("error" in result) return result.error;
  if (!result.typecheck.ok) {
    return result.typecheck.stderr || result.typecheck.stdout || "Typecheck failed";
  }
  if (!result.build.ok) {
    return result.build.stderr || result.build.stdout || "Build failed";
  }
  return null;
}

function isDependentPhase(phase: EditPhaseSpec, plan: EditPhasePlan): boolean {
  return phase.dependsOn.length > 0 || phase.index === plan.phases.length - 1;
}

/**
 * Run bounded multi-phase edit: generate → completeness → atomic apply → verify.
 * Stops cleanly on credits, cancellation, or exhausted repair budget.
 */
export async function runMultiPhaseEdit(
  host: MultiPhaseEditHost,
  initialPlan: EditPhasePlan,
): Promise<MultiPhaseEditResult> {
  let plan: EditPhasePlan = {
    ...initialPlan,
    status: "running",
  };
  plan = publish(host, plan);
  let providerCalls = 0;
  let repairAttempts = 0;

  while (true) {
    if (host.isCancelled?.()) {
      plan = publish(host, cancelBetweenPhases(plan));
      return {
        ok: false,
        plan,
        error: "Cancelled between phases",
        providerCalls,
        repairAttempts,
      };
    }

    const phase = firstIncompletePhase(plan);
    if (!phase) {
      plan = publish(host, { ...plan, status: "completed", currentPhaseId: null });
      return { ok: true, plan, error: null, providerCalls, repairAttempts };
    }

    const startedAt = Date.now();
    plan = publish(
      host,
      markPhaseStatus(plan, phase.id, {
        status: "generating",
        attempt: (plan.phaseStates[phase.id]?.attempt ?? 0) + 1,
        startedAt,
        error: null,
      }),
    );
    host.appendLog?.(
      `Edit phase ${phase.index + 1}/${plan.phases.length}: ${phase.title}`,
      `Files: ${phase.files.map((f) => f.relPath).join(", ")} · remaining ${remainingPhases(plan).length}`,
    );

    const proposal = await host.proposePhasePatches(phase);
    providerCalls += 1;

    if (proposal.creditError) {
      plan = publish(
        host,
        pausePlanForCredits(
          markPhaseStatus(plan, phase.id, {
            status: "paused",
            error: proposal.creditError,
            elapsedMs: Date.now() - startedAt,
            providerCalls: (plan.phaseStates[phase.id]?.providerCalls ?? 0) + 1,
          }),
          proposal.creditError,
        ),
      );
      return {
        ok: false,
        plan,
        error: proposal.creditError,
        providerCalls,
        repairAttempts,
      };
    }

    const completeness = evaluatePhasePatchCompleteness({
      assigned: phase.files,
      patches: proposal.patches.map((p) => {
        const truncated = proposal.truncated === true || p.truncated === true;
        return truncated
          ? { relPath: p.relPath, newContent: p.newContent, truncated: true }
          : { relPath: p.relPath, newContent: p.newContent };
      }),
      rawProviderText: proposal.rawText,
    });

    if (!completeness.ok) {
      plan = publish(
        host,
        markPhaseStatus(plan, phase.id, {
          status: "failed",
          error: completeness.error,
          elapsedMs: Date.now() - startedAt,
          completedAt: Date.now(),
          providerCalls: (plan.phaseStates[phase.id]?.providerCalls ?? 0) + 1,
        }),
      );
      plan = publish(host, { ...plan, status: "failed" });
      return {
        ok: false,
        plan,
        error: completeness.error,
        providerCalls,
        repairAttempts,
      };
    }

    // Schedule discovered deps into a later pending phase when needed.
    if (completeness.discoveredDependencies.length > 0) {
      const deferred = deferDiscoveredDependencies(completeness.discoveredDependencies);
      host.appendLog?.(
        "Deferring discovered dependencies",
        deferred.map((d) => d.relPath).join(", "),
      );
    }

    plan = publish(
      host,
      markPhaseStatus(plan, phase.id, { status: "staging" }),
    );

    const assignedPatches = proposal.patches.filter((p) => {
      if (!p.newContent) return false;
      return phase.files.some((f) => f.relPath === p.relPath);
    });
    const staged = await host.buildStagedFiles(phase, assignedPatches);

    // Only apply patches for assigned phase files (required + optional with content).
    const assignedSet = new Set(phase.files.map((f) => f.relPath));
    const stagedAssigned = staged.filter((s) => assignedSet.has(s.relPath));

    plan = publish(
      host,
      markPhaseStatus(plan, phase.id, { status: "applying" }),
    );

    const tx = await applyPhaseTransactionally(host.api, stagedAssigned, {
      timeoutMs: EDIT_PHASE_TIMING_MS.parseAndApply,
    });

    if (!tx.ok || tx.claimedSuccess === false) {
      plan = publish(
        host,
        markPhaseStatus(plan, phase.id, {
          status: "failed",
          error: tx.error,
          beforeHashes: tx.beforeHashes,
          afterHashes: tx.afterHashes,
          rolledBack: tx.rolledBack,
          filesChanged: [],
          elapsedMs: Date.now() - startedAt,
          completedAt: Date.now(),
        }),
      );
      plan = publish(host, { ...plan, status: "failed" });
      return {
        ok: false,
        plan,
        error: tx.error ?? "Phase transaction failed",
        providerCalls,
        repairAttempts,
      };
    }

    plan = publish(
      host,
      markPhaseStatus(plan, phase.id, {
        status: "verifying",
        beforeHashes: tx.beforeHashes,
        afterHashes: tx.afterHashes,
        filesChanged: tx.applied,
        rolledBack: false,
      }),
    );

    const verify =
      isDependentPhase(phase, plan) || remainingPhases(plan).length <= 1
        ? await host.verifyFull()
        : await host.verifyFast();

    let verifyError = verificationFailed(verify);
    if (verifyError && host.repairPhase) {
      const priorRepairs = plan.phaseStates[phase.id]?.repairAttempts ?? 0;
      if (priorRepairs < MAX_PHASE_REPAIR_ATTEMPTS) {
        plan = publish(
          host,
          markPhaseStatus(plan, phase.id, {
            status: "repairing",
            repairAttempts: priorRepairs + 1,
          }),
        );
        repairAttempts += 1;
        const repair = await host.repairPhase(phase, verifyError);
        providerCalls += 1;
        if (repair.creditError) {
          plan = publish(
            host,
            pausePlanForCredits(
              markPhaseStatus(plan, phase.id, {
                status: "paused",
                error: repair.creditError,
              }),
              repair.creditError,
            ),
          );
          return {
            ok: false,
            plan,
            error: repair.creditError,
            providerCalls,
            repairAttempts,
          };
        }
        const repairStaged = await host.buildStagedFiles(phase, repair.patches);
        const repairTx = await applyPhaseTransactionally(
          host.api,
          repairStaged.filter((s) => assignedSet.has(s.relPath)),
          { timeoutMs: EDIT_PHASE_TIMING_MS.parseAndApply },
        );
        if (!repairTx.ok) {
          plan = publish(
            host,
            markPhaseStatus(plan, phase.id, {
              status: "failed",
              error: repairTx.error,
              rolledBack: repairTx.rolledBack,
              completedAt: Date.now(),
              elapsedMs: Date.now() - startedAt,
            }),
          );
          plan = publish(host, { ...plan, status: "failed" });
          return {
            ok: false,
            plan,
            error: repairTx.error,
            providerCalls,
            repairAttempts,
          };
        }
        const recheck = await host.verifyFull();
        verifyError = verificationFailed(recheck);
      }
    }

    if (verifyError) {
      // Roll back this phase's writes — leave prior completed phases intact.
      await applyPhaseTransactionally(
        host.api,
        stagedAssigned.map((s) => ({
          ...s,
          afterContent: s.beforeContent,
          beforeContent: s.afterContent,
          action: s.action === "create" ? "modify" : s.action,
        })),
      ).catch(() => undefined);

      plan = publish(
        host,
        markPhaseStatus(plan, phase.id, {
          status: "failed",
          error: verifyError,
          rolledBack: true,
          completedAt: Date.now(),
          elapsedMs: Date.now() - startedAt,
        }),
      );
      plan = publish(host, { ...plan, status: "failed" });
      return { ok: false, plan, error: verifyError, providerCalls, repairAttempts };
    }

    plan = publish(
      host,
      markPhaseStatus(plan, phase.id, {
        status: "completed",
        completedAt: Date.now(),
        elapsedMs: Date.now() - startedAt,
        providerCalls: (plan.phaseStates[phase.id]?.providerCalls ?? 0) + 1,
        filesChanged: tx.applied,
        beforeHashes: tx.beforeHashes,
        afterHashes: tx.afterHashes,
        rolledBack: false,
        error: null,
      }),
    );
  }
}

export function formatPhaseProgressLine(plan: EditPhasePlan): string {
  const phase = plan.phases.find((p) => p.id === plan.currentPhaseId);
  const state = phase ? plan.phaseStates[phase.id] : null;
  const remaining = remainingPhases(plan).length;
  const elapsed = state?.elapsedMs
    ? `${Math.round(state.elapsedMs / 1000)}s`
    : state?.startedAt
      ? `${Math.round((Date.now() - state.startedAt) / 1000)}s`
      : "0s";
  return [
    phase ? `${phase.title}` : "Edit phases",
    state ? `status=${state.status}` : "",
    state ? `attempt=${state.attempt}` : "",
    `elapsed=${elapsed}`,
    `remaining=${remaining}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export { EDIT_PHASE_TIMING_MS };
