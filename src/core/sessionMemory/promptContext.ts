import { buildPlanContext } from "@/core/planner/context";
import type { PlanContext } from "@/core/planner/aiTypes";
import {
  resolveFollowUpPrompt,
  mentionsSubject,
  type FollowUpContextHints,
} from "@/core/sessionMemory/followUp";
import type {
  SessionMemoryDiagnostics,
  SessionMemorySnapshot,
} from "@/core/sessionMemory/types";

function followUpChanged(
  followUp: ReturnType<typeof resolveFollowUpPrompt>,
): boolean {
  return followUp.rawPrompt !== followUp.effectivePrompt;
}
import type { ProjectScan } from "@/types";

const MAX_PROMPTS_IN_CONTEXT = 8;
const MAX_PLANS_IN_CONTEXT = 4;
const MAX_FAILURES_IN_CONTEXT = 4;
const MAX_AUTOFIX_IN_CONTEXT = 3;

export function buildSessionMemoryDiagnostics(
  memory: SessionMemorySnapshot,
  followUp: ReturnType<typeof resolveFollowUpPrompt>,
): SessionMemoryDiagnostics {
  const used =
    memory.prompts.length > 0 ||
    memory.plans.length > 0 ||
    memory.modifiedFiles.length > 0 ||
    memory.failures.length > 0 ||
    followUp.inferredSubject !== null;

  const lines: string[] = [];
  if (used) {
    lines.push("Using session memory:");
    if (memory.lastPrompt) {
      lines.push(`- Previous prompt: "${memory.lastPrompt}"`);
    }
    if (memory.modifiedFiles.length > 0) {
      lines.push(
        `- Previous modified files: ${memory.modifiedFiles.slice(-6).join(", ")}`,
      );
    }
    const prevPlan =
      memory.lastAiPlan?.summary ?? memory.lastDeterministicPlan?.summary;
    if (prevPlan) {
      lines.push(`- Previous plan: ${prevPlan}`);
    }
    if (followUp.inferredSubject && followUp.rawPrompt !== followUp.effectivePrompt) {
      lines.push(`- Follow-up: ${followUp.reason}`);
    }
  }

  return {
    used,
    previousPrompt: memory.lastPrompt,
    previousModifiedFiles: memory.modifiedFiles,
    previousPlanSummary:
      memory.lastAiPlan?.summary ?? memory.lastDeterministicPlan?.summary ?? null,
    followUp: followUp.rawPrompt !== followUp.effectivePrompt ? followUp : null,
    lines,
  };
}

/** Build AI plan context: repository relevance + session memory. */
export function buildAIPlanContextWithSession(
  scan: ProjectScan,
  rawPrompt: string,
  memory: SessionMemorySnapshot,
  opts?: {
    projectMemory?: import("@/core/projectMemory/types").ProjectMemory | null;
    projectPath?: string | null;
  },
): { context: PlanContext; diagnostics: SessionMemoryDiagnostics } {
  const hints: FollowUpContextHints | undefined =
    opts?.projectMemory?.projectName || opts?.projectPath
      ? {
          ...(opts.projectMemory?.projectName
            ? { appNameHint: opts.projectMemory.projectName }
            : {}),
          ...(opts?.projectPath ? { projectPath: opts.projectPath } : {}),
        }
      : undefined;
  const followUp = resolveFollowUpPrompt(rawPrompt, memory, hints);
  const effectivePrompt = followUp.effectivePrompt;

  const base = buildPlanContext(scan, effectivePrompt, {
    projectMemory: opts?.projectMemory ?? null,
    sessionMemory: memory,
    projectPath: opts?.projectPath ?? null,
  });

  const recentPrompts = memory.prompts
    .map((p) => p.prompt)
    .filter((p) => p !== rawPrompt)
    .slice(-MAX_PROMPTS_IN_CONTEXT);

  const recentPlans = memory.plans.slice(-MAX_PLANS_IN_CONTEXT).map((p) => ({
    source: p.source,
    prompt: p.prompt,
    summary: p.summary,
    files: [...p.files],
  }));

  const context: PlanContext = {
    ...base,
    sessionMemory: {
      branch: memory.branch,
      recentPrompts,
      recentPlans,
      recentModifiedFiles: memory.modifiedFiles.slice(-12),
      recentFailures: memory.failures
        .slice(-MAX_FAILURES_IN_CONTEXT)
        .map((f) => f.summary),
      recentAutoFixes: memory.autoFixes.slice(-MAX_AUTOFIX_IN_CONTEXT).map((a) => ({
        summary: a.summary,
        files: [...a.files],
      })),
      ...(followUpChanged(followUp)
        ? {
            followUpResolution: {
              rawPrompt: followUp.rawPrompt,
              effectivePrompt: followUp.effectivePrompt,
              inferredSubject: followUp.inferredSubject,
              reason: followUp.reason,
            },
          }
        : {}),
    },
  };

  const diagnostics = buildSessionMemoryDiagnostics(memory, followUp);
  return { context, diagnostics };
}

/** Effective prompt for deterministic planning (same follow-up rules). */
export function effectivePlanPrompt(
  rawPrompt: string,
  memory: SessionMemorySnapshot,
  hints?: FollowUpContextHints,
): string {
  return resolveFollowUpPrompt(rawPrompt, memory, hints).effectivePrompt;
}

export function sessionHintsFeatureContinuity(
  rawPrompt: string,
  memory: SessionMemorySnapshot,
): boolean {
  const subject = resolveFollowUpPrompt(rawPrompt, memory).inferredSubject;
  if (!subject) return false;
  const prior = memory.plans.some(
    (p) =>
      mentionsSubject(p.prompt, subject) ||
      mentionsSubject(p.summary, subject),
  );
  const modified = memory.modifiedFiles.some((f) =>
    f.toLowerCase().includes(subject.split(" ")[0] ?? ""),
  );
  return prior || modified;
}
