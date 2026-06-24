import type { Plan } from "@/core/planner/types";

/** Terminal / dev commands must never become the plan or apply prompt. */
const DEV_COMMAND_START =
  /^\s*(npm|pnpm|yarn|npx|node|electron|vite|tsc|tsx|concurrently|cross-env)\b/i;

const DEV_SCRIPT_HINT =
  /\b(electron:dev|electron:\w+|vite\s+(build|dev|preview)|npm\s+run|pnpm\s+run|yarn\s+run)\b/i;

/**
 * True when the text looks like a shell/dev command rather than a product change request.
 */
export function isDisallowedPlanPrompt(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return true;
  if (DEV_COMMAND_START.test(t)) return true;
  if (DEV_SCRIPT_HINT.test(t)) return true;
  return false;
}

/**
 * Canonical user request for planning, AI plan, apply plan, and Summary.
 * Prefers the deterministic plan prompt; ignores polluted lastPlanPrompt values.
 */
export function resolveUserPlanPrompt(
  plan: Plan | null,
  lastPlanPrompt: string | null,
  explicitPrompt?: string | null,
): string | null {
  const explicit = explicitPrompt?.trim();
  if (explicit && !isDisallowedPlanPrompt(explicit)) return explicit;

  if (plan?.prompt) {
    const fromPlan = plan.prompt.trim();
    if (fromPlan && !isDisallowedPlanPrompt(fromPlan)) return fromPlan;
  }
  if (lastPlanPrompt) {
    const fromLast = lastPlanPrompt.trim();
    if (fromLast && !isDisallowedPlanPrompt(fromLast)) return fromLast;
  }
  if (plan?.prompt?.trim()) return plan.prompt.trim();
  return null;
}
