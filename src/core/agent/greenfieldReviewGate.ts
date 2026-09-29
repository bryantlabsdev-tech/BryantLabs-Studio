import { diffLineStats } from "@/core/planApply/stats";
import type { PlanApplySession } from "@/core/planApply/types";

/** Marks a synthetic review session created from a One Agent greenfield parse. */
export const GREENFIELD_REVIEW_SELECTION_REASON = "greenfield-review";

export type GreenfieldRunControl = {
  cancel: () => void;
  acceptReview?: () => Promise<void>;
  runRepair?: () => Promise<void>;
};

export interface GreenfieldReviewFile {
  readonly path: string;
  readonly content: string;
}

export interface GreenfieldReviewProposal {
  readonly projectPath: string;
  readonly generationId: string;
  readonly prompt: string;
  readonly fileFingerprint: string;
  readonly files: readonly GreenfieldReviewFile[];
}

export interface GreenfieldReviewCurrent {
  readonly projectPath: string | null;
  readonly generationId: string | null;
  readonly prompt: string;
  readonly files?: readonly GreenfieldReviewFile[];
}

export type GreenfieldReviewDecision = "pending" | "accept" | "reject" | "cancel";

export type GreenfieldReviewAction = {
  readonly write: boolean;
  readonly setup: boolean;
  readonly clearProposal: boolean;
  readonly reason:
    | "paused"
    | "accepted"
    | "rejected"
    | "invalidated"
    | "already_written"
    | "missing";
};

export type OneAgentGreenfieldPostParse =
  | { readonly action: "pause"; readonly sideEffects: readonly [] }
  | { readonly action: "write"; readonly sideEffects: readonly ["write", "setup"] }
  | { readonly action: "skip"; readonly sideEffects: readonly [] };

/**
 * Default review-first for One Agent greenfield. Explicit "0" is the only
 * off switch. This does not consult AUTO_APPLY_FOLLOW_UP_PATCHES.
 */
export function isGreenfieldReviewFirst(raw: string | null): boolean {
  return raw !== "0";
}

export function greenfieldFileFingerprint(
  files: readonly GreenfieldReviewFile[],
): string {
  let hash = 0x811c9dc5;
  for (const file of files) {
    const text = `${file.path}\0${file.content}\0`;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16);
}

export function createGreenfieldReviewProposal(input: {
  readonly projectPath: string;
  readonly generationId: string;
  readonly prompt: string;
  readonly files: readonly GreenfieldReviewFile[];
}): GreenfieldReviewProposal {
  const files = input.files.map((file) => ({
    path: file.path,
    content: file.content,
  }));
  return {
    projectPath: input.projectPath,
    generationId: input.generationId,
    prompt: input.prompt,
    fileFingerprint: greenfieldFileFingerprint(files),
    files,
  };
}

export function greenfieldProposalIsCurrent(
  proposal: GreenfieldReviewProposal,
  current: GreenfieldReviewCurrent,
): boolean {
  if (current.projectPath !== proposal.projectPath) return false;
  if (current.generationId !== proposal.generationId) return false;
  if (current.prompt !== proposal.prompt) return false;
  if (current.files) {
    return greenfieldFileFingerprint(current.files) === proposal.fileFingerprint;
  }
  return true;
}

export function isGreenfieldReviewSession(
  session: PlanApplySession | null | undefined,
): boolean {
  if (!session || session.files.length === 0) return false;
  return session.files.every(
    (file) => file.selectionReason === GREENFIELD_REVIEW_SELECTION_REASON,
  );
}

export function buildGreenfieldReviewSession(
  proposal: GreenfieldReviewProposal,
): PlanApplySession {
  const root = proposal.projectPath.replace(/\/$/, "");
  const files = proposal.files.map((file) => {
    const stats = diffLineStats("", file.content);
    return {
      relPath: file.path,
      absPath: `${root}/${file.path}`,
      action: "create" as const,
      selectionReason: GREENFIELD_REVIEW_SELECTION_REASON,
      planReason: "Generated file awaiting review",
      status: "ready" as const,
      decision: "pending" as const,
      basisContent: "",
      proposal: {
        summary: `Create ${file.path}`,
        newContent: file.content,
        reasoning: "One Agent greenfield generation",
        risks: [],
      },
      diffStats:
        file.content.length > 0 ? { ...stats, changed: true as const } : stats,
    };
  });
  return {
    applyRunId: proposal.generationId,
    prompt: proposal.prompt,
    planSummary: "Review generated app files",
    planSource: "deterministic",
    applyTargetCount: files.length,
    applySkippedCount: 0,
    files,
    phase: "waiting_for_review",
    selectedRelPath: files[0]?.relPath ?? null,
    applyError: null,
    verification: null,
    totals: null,
  };
}

/**
 * One Agent empty-folder generation pauses for Review changes / Accept all
 * unless review-first was explicitly turned off. The New App wizard is not
 * this path.
 */
export function resolveOneAgentGreenfieldAfterParse(input: {
  readonly agentStreamlined: boolean;
  readonly reviewFirstRaw: string | null;
  readonly decisionReady: boolean;
}): OneAgentGreenfieldPostParse {
  if (!input.agentStreamlined || !input.decisionReady) {
    return { action: "skip", sideEffects: [] };
  }
  if (isGreenfieldReviewFirst(input.reviewFirstRaw)) {
    return { action: "pause", sideEffects: [] };
  }
  return { action: "write", sideEffects: ["write", "setup"] };
}

export function resolveGreenfieldReviewAction(input: {
  readonly proposal: GreenfieldReviewProposal | null;
  readonly current: GreenfieldReviewCurrent;
  readonly decision: GreenfieldReviewDecision;
  readonly writesCompleted: number;
}): GreenfieldReviewAction {
  if (!input.proposal) {
    return { write: false, setup: false, clearProposal: false, reason: "missing" };
  }
  if (!greenfieldProposalIsCurrent(input.proposal, input.current)) {
    return {
      write: false,
      setup: false,
      clearProposal: true,
      reason: "invalidated",
    };
  }
  if (input.decision === "reject" || input.decision === "cancel") {
    return { write: false, setup: false, clearProposal: true, reason: "rejected" };
  }
  if (input.decision === "pending") {
    return { write: false, setup: false, clearProposal: false, reason: "paused" };
  }
  if (input.writesCompleted > 0) {
    return {
      write: false,
      setup: false,
      clearProposal: true,
      reason: "already_written",
    };
  }
  return { write: true, setup: true, clearProposal: true, reason: "accepted" };
}

/**
 * The bytes written after Accept all are the frozen proposal, and only when
 * those bytes still match the proposal fingerprint, the live generation, and
 * the diff the review surface is showing.
 */
export function resolveApprovedGreenfieldWrite(input: {
  readonly proposal: GreenfieldReviewProposal;
  readonly liveFiles: readonly GreenfieldReviewFile[];
  readonly shownFiles?: readonly GreenfieldReviewFile[];
}):
  | { readonly ok: true; readonly files: readonly GreenfieldReviewFile[] }
  | { readonly ok: false; readonly reason: "fingerprint" | "live_files" | "shown_files" } {
  const frozen = input.proposal.files.map((file) => ({
    path: file.path,
    content: file.content,
  }));
  if (greenfieldFileFingerprint(frozen) !== input.proposal.fileFingerprint) {
    return { ok: false, reason: "fingerprint" };
  }
  if (greenfieldFileFingerprint(input.liveFiles) !== input.proposal.fileFingerprint) {
    return { ok: false, reason: "live_files" };
  }
  if (
    input.shownFiles &&
    greenfieldFileFingerprint(input.shownFiles) !== input.proposal.fileFingerprint
  ) {
    return { ok: false, reason: "shown_files" };
  }
  return { ok: true, files: frozen };
}
