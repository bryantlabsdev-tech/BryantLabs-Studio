import { buildAutoFixContext } from "@/core/autoFix/fixContext";
import { pickRepairTargetPath } from "@/core/autoFix/targets";
import type {
  AutoFixAttemptLog,
  AutoFixContext,
  AutoFixMode,
  AutoFixPendingRepair,
  AutoFixSession,
} from "@/core/autoFix/types";
import { MAX_AUTO_FIX_ATTEMPTS } from "@/core/autoFix/types";
import { validateProposalQuality } from "@/core/planApply/proposalValidation";
import type { AIPatchResult } from "@/core/planner/aiTypes";
import type { EditResult, ProjectScan, VerificationResult } from "@/types";

export interface AutoFixProposeInput {
  readonly provider: import("@/core/providers/types").ProviderId;
  readonly context: AutoFixContext;
  readonly relPath: string;
  readonly absPath: string;
  readonly content: string;
}

export interface AutoFixLoopCallbacks {
  readonly mode: AutoFixMode;
  readonly provider: AutoFixProposeInput["provider"];
  readonly scan: ProjectScan;
  readonly projectRoot: string;
  readonly originalRequest: string;
  readonly planSummary: string;
  readonly planSource: string;
  readonly modifiedFiles: readonly string[];
  readonly originalFailureLine: string;
  readonly proposeFix: (input: AutoFixProposeInput) => Promise<AIPatchResult>;
  readonly readFile: (absPath: string) => Promise<string | null>;
  readonly applyEdit: (
    absPath: string,
    before: string,
    after: string,
  ) => Promise<EditResult>;
  readonly verify: () => Promise<VerificationResult | { error: string }>;
  readonly onAttemptLog: (entry: AutoFixAttemptLog) => void;
  readonly onPhase: (phase: AutoFixSession["phase"]) => void;
  readonly onPendingRepair: (repair: AutoFixPendingRepair) => void;
}

export interface AutoFixLoopResult {
  readonly ok: boolean;
  readonly verification: VerificationResult | null;
  readonly session: AutoFixSession;
  readonly awaitingApproval: boolean;
}

export async function runAutoFixLoop(
  initialVerification: VerificationResult,
  callbacks: AutoFixLoopCallbacks,
  opts?: {
    startAttempt?: number;
    seedAttempts?: AutoFixAttemptLog[];
    seedFilesChanged?: string[];
    maxAttempts?: number;
  },
): Promise<AutoFixLoopResult> {
  let verification: VerificationResult | null = initialVerification;
  const attempts: AutoFixAttemptLog[] = [...(opts?.seedAttempts ?? [])];
  const filesChanged: string[] = [...(opts?.seedFilesChanged ?? [])];
  const startAttempt = opts?.startAttempt ?? 1;
  const maxAttempts = opts?.maxAttempts ?? MAX_AUTO_FIX_ATTEMPTS;

  const sessionBase = {
    verification: initialVerification,
    originalFailureLine: callbacks.originalFailureLine,
    context: buildAutoFixContext({
      verification: initialVerification,
      originalRequest: callbacks.originalRequest,
      planSummary: callbacks.planSummary,
      planSource: callbacks.planSource,
      modifiedFiles: callbacks.modifiedFiles,
      attemptNumber: 1,
      projectRoot: callbacks.projectRoot,
      maxAttempts,
    })!,
    phase: "proposing" as const,
    attempts,
    pendingRepair: null,
    filesChanged,
    finalOutcome: null,
    error: null,
  };

  if (!sessionBase.context) {
    return {
      ok: false,
      verification: initialVerification,
      awaitingApproval: false,
      session: {
        ...sessionBase,
        phase: "failed",
        finalOutcome: "exhausted",
        error: "Could not build repair context from verification output.",
      },
    };
  }

  for (let attempt = startAttempt; attempt <= maxAttempts; attempt++) {
    if (!verification) break;

    const ctx =
      buildAutoFixContext({
        verification,
        originalRequest: callbacks.originalRequest,
        planSummary: callbacks.planSummary,
        planSource: callbacks.planSource,
        modifiedFiles: [
          ...callbacks.modifiedFiles,
          ...filesChanged,
        ],
        attemptNumber: attempt,
        projectRoot: callbacks.projectRoot,
        maxAttempts,
      }) ?? sessionBase.context;

    const targetRel = pickRepairTargetPath(
      ctx.primaryFailure,
      callbacks.scan,
      [...callbacks.modifiedFiles, ...filesChanged],
    );
    if (!targetRel) {
      attempts.push({
        attempt,
        headline: "No repair target",
        detail: "Could not map failure to a modified project file.",
        filesTouched: [],
        outcome: "skipped",
      });
      callbacks.onAttemptLog(attempts[attempts.length - 1]!);
      break;
    }

    const targetAbs =
      callbacks.scan.files.find((f) => f.path === targetRel)?.absPath ?? "";
    if (!targetAbs) break;

    callbacks.onPhase("proposing");
    const content = await callbacks.readFile(targetAbs);
    if (content === null) {
      attempts.push({
        attempt,
        headline: "Read failed",
        detail: `Could not read ${targetRel} for repair.`,
        filesTouched: [],
        outcome: "skipped",
      });
      callbacks.onAttemptLog(attempts[attempts.length - 1]!);
      continue;
    }

    const patch = await callbacks.proposeFix({
      provider: callbacks.provider,
      context: ctx,
      relPath: targetRel,
      absPath: targetAbs,
      content,
    });

    if (!patch.ok || !patch.proposal) {
      attempts.push({
        attempt,
        headline: "Fix proposal failed",
        detail: patch.error ?? "Model did not return a valid repair.",
        filesTouched: [],
        outcome: "failed",
      });
      callbacks.onAttemptLog(attempts[attempts.length - 1]!);
      continue;
    }

    const quality = validateProposalQuality(
      content,
      patch.proposal.newContent,
      targetRel,
    );
    if (!quality.ok) {
      attempts.push({
        attempt,
        headline: "Invalid repair proposal",
        detail: quality.reason,
        filesTouched: [],
        outcome: "failed",
      });
      callbacks.onAttemptLog(attempts[attempts.length - 1]!);
      continue;
    }

    const pending: AutoFixPendingRepair = {
      relPath: targetRel,
      absPath: targetAbs,
      basisContent: content,
      newContent: patch.proposal.newContent,
      summary: patch.proposal.summary || "Repair proposal",
    };

    if (callbacks.mode === "ask") {
      callbacks.onPhase("awaiting_approval");
      callbacks.onPendingRepair(pending);
      return {
        ok: false,
        verification,
        awaitingApproval: true,
        session: {
          ...sessionBase,
          context: ctx,
          phase: "awaiting_approval",
          attempts,
          pendingRepair: pending,
          filesChanged,
          finalOutcome: null,
          error: null,
        },
      };
    }

    const applied = await applyPendingRepair(
      pending,
      callbacks,
      attempt,
      attempts,
      filesChanged,
    );
    if (!applied.verification) {
      verification = null;
      break;
    }
    verification = applied.verification;

    if (applied.ok) {
      return {
        ok: true,
        verification,
        awaitingApproval: false,
        session: {
          ...sessionBase,
          context: ctx,
          verification,
          phase: "success",
          attempts,
          pendingRepair: null,
          filesChanged,
          finalOutcome: "repaired",
          error: null,
        },
      };
    }
  }

  return {
    ok: false,
    verification,
    awaitingApproval: false,
    session: {
      ...sessionBase,
      verification: verification ?? initialVerification,
      phase: "failed",
      attempts,
      pendingRepair: null,
      filesChanged,
      finalOutcome: "exhausted",
      error: "Auto Fix could not restore a passing build after maximum attempts.",
    },
  };
}

/** After user approves a repair in Ask mode, apply it and continue the loop. */
export async function resumeAutoFixAfterApproval(
  session: AutoFixSession,
  callbacks: AutoFixLoopCallbacks,
): Promise<AutoFixLoopResult> {
  const pending = session.pendingRepair;
  if (!pending) {
    return {
      ok: false,
      verification: session.verification,
      awaitingApproval: false,
      session: { ...session, phase: "failed", error: "No pending repair." },
    };
  }

  const attempts = [...session.attempts];
  const filesChanged = [...session.filesChanged];
  const attempt = attempts.length + 1;

  const applied = await applyPendingRepair(
    pending,
    callbacks,
    attempt,
    attempts,
    filesChanged,
  );

  if (applied.ok && applied.verification) {
    return {
      ok: true,
      verification: applied.verification,
      awaitingApproval: false,
      session: {
        ...session,
        verification: applied.verification,
        phase: "success",
        attempts,
        pendingRepair: null,
        filesChanged,
        finalOutcome: "repaired",
        error: null,
      },
    };
  }

  if (!applied.verification) {
    return {
      ok: false,
      verification: session.verification,
      awaitingApproval: false,
      session: {
        ...session,
        phase: "failed",
        attempts,
        pendingRepair: null,
        filesChanged,
        finalOutcome: "exhausted",
        error: "Verification could not run after repair.",
      },
    };
  }

  if (attempt >= session.context.maxAttempts) {
    return {
      ok: false,
      verification: applied.verification,
      awaitingApproval: false,
      session: {
        ...session,
        verification: applied.verification,
        phase: "failed",
        attempts,
        pendingRepair: null,
        filesChanged,
        finalOutcome: "exhausted",
        error: "Auto Fix exhausted all repair attempts.",
      },
    };
  }

  return runAutoFixLoop(applied.verification, callbacks, {
    startAttempt: attempt + 1,
    seedAttempts: attempts,
    seedFilesChanged: filesChanged,
  });
}

async function applyPendingRepair(
  pending: AutoFixPendingRepair,
  callbacks: AutoFixLoopCallbacks,
  attempt: number,
  attempts: AutoFixAttemptLog[],
  filesChanged: string[],
): Promise<{ ok: boolean; verification: VerificationResult | null }> {
  callbacks.onPhase("applying");
  const write = await callbacks.applyEdit(
    pending.absPath,
    pending.basisContent,
    pending.newContent,
  );

  if (!write.ok) {
    attempts.push({
      attempt,
      headline: "Repair write failed",
      detail: write.reason ?? "Apply failed",
      filesTouched: [],
      outcome: "failed",
    });
    callbacks.onAttemptLog(attempts[attempts.length - 1]!);
    return { ok: false, verification: null };
  }

  if (!filesChanged.includes(pending.relPath)) {
    filesChanged.push(pending.relPath);
  }

  callbacks.onPhase("verifying");
  const verifyRes = await callbacks.verify();
  if ("error" in verifyRes) {
    attempts.push({
      attempt,
      headline: "Verification failed to run",
      detail: verifyRes.error,
      filesTouched: [pending.relPath],
      outcome: "failed",
    });
    callbacks.onAttemptLog(attempts[attempts.length - 1]!);
    return { ok: false, verification: null };
  }

  const tcOk = verifyRes.typecheck.ok;
  const buildOk = verifyRes.build.ok;
  if (tcOk && buildOk) {
    attempts.push({
      attempt,
      headline: "Build passed",
      detail: pending.summary,
      filesTouched: [pending.relPath],
      outcome: "passed",
    });
    callbacks.onAttemptLog(attempts[attempts.length - 1]!);
    return { ok: true, verification: verifyRes };
  }

  const stage = !tcOk ? "TypeScript failed" : "Build failed";
  attempts.push({
    attempt,
    headline: stage,
    detail: pending.summary,
    filesTouched: [pending.relPath],
    outcome: "failed",
  });
  callbacks.onAttemptLog(attempts[attempts.length - 1]!);
  return { ok: false, verification: verifyRes };
}
