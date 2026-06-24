/**
 * Operation-specific HTTP timeouts for provider generate calls.
 * Health checks use their own fixed timeouts in gemini.cts / ollama.cts.
 */

export const PROVIDER_TIMEOUT_MS = {
  /** Health + Providers panel test prompt. */
  generateTest: 20_000,
  /** AI planning. */
  generatePlan: 30_000,
  /** Single-file / small patch proposal. */
  generatePatchSmall: 60_000,
  /** Multi-file / large patch proposal. */
  generatePatch: 120_000,
  /** Greenfield new-app generation. */
  generateGreenfield: 120_000,
  /** Auto-fix / repair patches. */
  generateRepair: 60_000,
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
