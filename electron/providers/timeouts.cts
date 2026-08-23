/**
 * Operation-specific HTTP timeouts for provider generate calls.
 * Bounded for multi-phase editing — never 10–15 minute single calls.
 */

export const PROVIDER_TIMEOUT_MS = {
  /** Health + Providers panel test prompt. */
  generateTest: 20_000,
  /** AI planning. */
  generatePlan: 180_000,
  /** Single-file / small patch proposal (≤3 min). */
  generatePatchSmall: 180_000,
  /** Multi-file phase patch proposal (≤3 min). */
  generatePatch: 180_000,
  /**
   * @deprecated Alias kept for callers; same as generatePatch (3 min max).
   * Large edits must be split into phases instead of raising this budget.
   */
  generatePatchXLarge: 180_000,
  /** Greenfield phase generation (≤3 min per phase). */
  generateGreenfield: 180_000,
  /** @deprecated Same as generateGreenfield — use multi-phase instead. */
  generateGreenfieldLarge: 180_000,
  /** @deprecated Same as generateGreenfield — use multi-phase instead. */
  generateGreenfieldXLarge: 180_000,
  /** Auto-fix / repair patches (≤3 min). */
  generateRepair: 180_000,
} as const;

export type ProviderGenerateOperation =
  | "test"
  | "plan"
  | "patch"
  | "patch_small"
  | "repair"
  | "greenfield";

export interface ProviderGenerateOptions {
  timeoutMs?: number;
  operation?: ProviderGenerateOperation;
  /** Sampling temperature (0–1). Omit to use provider default. */
  temperature?: number;
}

export const DEFAULT_GENERATE_TIMEOUT_MS = PROVIDER_TIMEOUT_MS.generateTest;

/** User-facing message when fetchJson aborts at timeoutMs. */
export function formatProviderTimeoutError(
  operation: ProviderGenerateOperation | undefined,
  timeoutMs: number,
): string {
  const seconds = Math.round(timeoutMs / 1000);
  switch (operation) {
    case "greenfield":
      return `Generation timed out after ${seconds} seconds`;
    case "plan":
      return `Planning timed out after ${seconds} seconds`;
    case "patch":
      return `Patch proposal timed out after ${seconds} seconds`;
    case "patch_small":
      return `Patch proposal timed out after ${seconds} seconds`;
    case "repair":
      return `Repair timed out after ${seconds} seconds`;
    case "test":
      return `Request timed out after ${seconds} seconds`;
    default:
      return `Request timed out after ${seconds} seconds`;
  }
}

export function isFetchTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    /operation was aborted/i.test(err.message) ||
    /aborted/i.test(err.message)
  );
}

export function resolveGenerateTimeout(
  options?: ProviderGenerateOptions,
): { timeoutMs: number; operation: ProviderGenerateOperation | undefined } {
  const operation = options?.operation;
  let timeoutMs = options?.timeoutMs;
  if (timeoutMs == null) {
    switch (operation) {
      case "plan":
        timeoutMs = PROVIDER_TIMEOUT_MS.generatePlan;
        break;
      case "patch_small":
        timeoutMs = PROVIDER_TIMEOUT_MS.generatePatchSmall;
        break;
      case "patch":
        timeoutMs = PROVIDER_TIMEOUT_MS.generatePatch;
        break;
      case "repair":
        timeoutMs = PROVIDER_TIMEOUT_MS.generateRepair;
        break;
      case "greenfield":
        timeoutMs = PROVIDER_TIMEOUT_MS.generateGreenfield;
        break;
      case "test":
        timeoutMs = PROVIDER_TIMEOUT_MS.generateTest;
        break;
      default:
        timeoutMs = DEFAULT_GENERATE_TIMEOUT_MS;
    }
  }
  return { timeoutMs, operation };
}

/** Match renderer estimatePromptComplexity for apply-plan HTTP budgets. */
export function estimatePatchPromptComplexity(
  prompt: string | null | undefined,
): "standard" | "large" | "xlarge" {
  const text = prompt?.trim() ?? "";
  if (!text) return "standard";
  const len = text.length;
  const bullets = (text.match(/^\s*[-*•]/gm) ?? []).length;
  const featureHits = (
    text.match(
      /dashboard|kanban|calendar|persist|theme|import|export|milestone|component/gi,
    ) ?? []
  ).length;
  if (len >= 2200 || bullets >= 12 || featureHits >= 10) return "xlarge";
  if (len >= 900 || bullets >= 6 || featureHits >= 5) return "large";
  return "standard";
}

/**
 * Phase-sized patch budgets — complexity no longer extends wall time.
 * Large prompts must be split into phases (see core/editPhases).
 */
export function resolveApplyPlanPatchGenerateOpts(
  userPrompt: string,
  fileCount: number,
): { timeoutMs: number; operation: "patch" | "patch_small" } {
  void userPrompt;
  if (fileCount > 1) {
    return {
      timeoutMs: PROVIDER_TIMEOUT_MS.generatePatch,
      operation: "patch",
    };
  }
  return {
    timeoutMs: PROVIDER_TIMEOUT_MS.generatePatchSmall,
    operation: "patch_small",
  };
}
