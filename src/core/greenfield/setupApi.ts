import type { GreenfieldSetupResult } from "@/core/greenfield/types";

/** IPC transport failure (invalid path, handler error) — not a partial setup result. */
export type GreenfieldSetupTransportError = { readonly error: string };

export function isGreenfieldSetupTransportError(
  result: GreenfieldSetupResult | GreenfieldSetupTransportError,
): result is GreenfieldSetupTransportError {
  return "error" in result && !("install" in result);
}
