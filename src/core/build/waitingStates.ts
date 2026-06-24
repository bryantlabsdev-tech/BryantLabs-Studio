import { AGENT_UX_WAITING_LABELS } from "@/core/agent/agentUxLabels";
import type { FollowUpRunPhase } from "./followUpRun";

/** Explicit user-facing waiting labels — never leave users wondering if Studio is stuck. */
export const EXPLICIT_WAITING_LABELS = AGENT_UX_WAITING_LABELS;

export function explicitWaitingLabel(
  phase: FollowUpRunPhase,
  opts?: { escalationNote?: string | null },
): string {
  if (opts?.escalationNote) return opts.escalationNote;
  return EXPLICIT_WAITING_LABELS[phase] ?? "Working…";
}
