import type { ClientRequest } from "node:http";

export type ProviderRequestKind = "http_json" | "child_process";

interface ActiveProviderRequest {
  readonly id: string;
  readonly kind: ProviderRequestKind;
  readonly startedAt: number;
  readonly attempt: number;
  abort: () => void;
}

const active = new Map<string, ActiveProviderRequest>();
let cancelGeneration = 0;

export function beginProviderRequest(input: {
  readonly id: string;
  readonly kind: ProviderRequestKind;
  readonly attempt: number;
  readonly abort: () => void;
}): void {
  active.set(input.id, {
    id: input.id,
    kind: input.kind,
    startedAt: Date.now(),
    attempt: input.attempt,
    abort: input.abort,
  });
}

export function endProviderRequest(id: string): void {
  active.delete(id);
}

export function registerHttpProviderRequest(
  requestId: string,
  attempt: number,
  req: ClientRequest,
  timers: { clear: () => void },
): void {
  beginProviderRequest({
    id: requestId,
    kind: "http_json",
    attempt,
    abort: () => {
      timers.clear();
      req.destroy(new Error("Provider request cancelled by user."));
    },
  });
}

/** Explicit user cancellation — aborts in-flight provider HTTP requests only. */
export function cancelActiveProviderRequests(_reason = "user_cancel"): number {
  cancelGeneration += 1;
  let count = 0;
  for (const entry of active.values()) {
    try {
      entry.abort();
      count += 1;
    } catch {
      // ignore double-abort
    }
  }
  active.clear();
  return count;
}

export function getCancelGeneration(): number {
  return cancelGeneration;
}

export function activeProviderRequestCount(): number {
  return active.size;
}
