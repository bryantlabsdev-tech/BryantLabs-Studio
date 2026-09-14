import type { ClientRequest } from "node:http";

export type ProviderRequestKind = "http_json" | "child_process";

export const PROVIDER_USER_CANCEL_MESSAGE = "Provider request cancelled by user.";

interface ActiveProviderRequest {
  readonly id: string;
  readonly kind: ProviderRequestKind;
  readonly startedAt: number;
  readonly attempt: number;
  readonly scope: string | null;
  abort: () => void;
}

const active = new Map<string, ActiveProviderRequest>();
const scopeStack: string[] = [];
const cancelledScopes: string[] = [];
const MAX_CANCELLED_SCOPES = 64;
let cancelGeneration = 0;
let stopPreviewForScope:
  | ((scope: string | null) => void | Promise<void>)
  | null = null;

export function bindPreviewStopForCancelledScope(
  stopper: ((scope: string | null) => void | Promise<void>) | null,
): void {
  stopPreviewForScope = stopper;
}

export function enterProviderRequestScope(scope: string): void {
  if (scope) scopeStack.push(scope);
}

export function leaveProviderRequestScope(scope: string): void {
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    if (scopeStack[i] === scope) {
      scopeStack.splice(i, 1);
      return;
    }
  }
}

export function currentProviderRequestScope(): string | null {
  return scopeStack[scopeStack.length - 1] ?? null;
}

export function isProviderScopeCancelled(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return cancelledScopes.includes(scope);
}

export function isCurrentProviderScopeCancelled(): boolean {
  return isProviderScopeCancelled(currentProviderRequestScope());
}

function markScopeCancelled(scope: string): void {
  if (cancelledScopes.includes(scope)) return;
  cancelledScopes.push(scope);
  if (cancelledScopes.length > MAX_CANCELLED_SCOPES) {
    cancelledScopes.shift();
  }
}

export async function runInProviderRequestScope<T>(
  scope: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!scope) return fn();
  enterProviderRequestScope(scope);
  try {
    return await fn();
  } finally {
    leaveProviderRequestScope(scope);
  }
}

export function beginProviderRequest(input: {
  readonly id: string;
  readonly kind: ProviderRequestKind;
  readonly attempt: number;
  readonly abort: () => void;
  readonly scope?: string | null;
}): void {
  const scope = input.scope === undefined ? currentProviderRequestScope() : input.scope;
  active.set(input.id, {
    id: input.id,
    kind: input.kind,
    startedAt: Date.now(),
    attempt: input.attempt,
    scope,
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
      req.destroy(new Error(PROVIDER_USER_CANCEL_MESSAGE));
    },
  });
}

function abortMatching(predicate: (entry: ActiveProviderRequest) => boolean): number {
  let count = 0;
  for (const [id, entry] of active.entries()) {
    if (!predicate(entry)) continue;
    try {
      entry.abort();
      count += 1;
    } catch {
      // ignore double-abort
    }
    active.delete(id);
  }
  return count;
}

/** Explicit user cancellation — aborts in-flight provider requests for a scope, or all if omitted. */
export function cancelActiveProviderRequests(
  _reason = "user_cancel",
  scope?: string | null,
): number {
  cancelGeneration += 1;
  const scoped = typeof scope === "string" && scope.length > 0;
  if (scoped) markScopeCancelled(scope);
  const cancelled = abortMatching((entry) => (scoped ? entry.scope === scope : true));
  const stopper = stopPreviewForScope;
  if (stopper) {
    void Promise.resolve(stopper(scoped ? scope : null)).catch(() => undefined);
  }
  return cancelled;
}

export function getCancelGeneration(): number {
  return cancelGeneration;
}

export function activeProviderRequestCount(): number {
  return active.size;
}

export function isProviderUserCancelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /cancelled by user/i.test(message);
}
