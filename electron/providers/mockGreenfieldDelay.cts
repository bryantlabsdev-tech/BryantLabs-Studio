import {
  beginProviderRequest,
  currentProviderRequestScope,
  endProviderRequest,
  isProviderScopeCancelled,
  PROVIDER_USER_CANCEL_MESSAGE,
} from "./providerRequestRegistry.cjs";

export function mockGreenfieldDelayMs(): number {
  const raw = process.env.BRYANTLABS_MOCK_GREENFIELD_DELAY_MS;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Abortable mock-provider pause so Stop can cancel before files exist. */
export function waitForMockGreenfieldDelay(): Promise<void> {
  const ms = mockGreenfieldDelayMs();
  if (ms <= 0) return Promise.resolve();
  if (process.env.BRYANTLABS_MOCK_GREENFIELD_DELAY_ONCE === "1") {
    if (process.env.BRYANTLABS_MOCK_GREENFIELD_DELAY_USED === "1") {
      return Promise.resolve();
    }
    process.env.BRYANTLABS_MOCK_GREENFIELD_DELAY_USED = "1";
  }
  const scope = currentProviderRequestScope();
  if (isProviderScopeCancelled(scope)) {
    return Promise.reject(new Error(PROVIDER_USER_CANCEL_MESSAGE));
  }
  return new Promise((resolve, reject) => {
    const id = `mock-greenfield-delay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      endProviderRequest(id);
      resolve();
    }, ms);
    beginProviderRequest({
      id,
      kind: "http_json",
      attempt: 1,
      abort: () => {
        clearTimeout(timer);
        endProviderRequest(id);
        reject(new Error(PROVIDER_USER_CANCEL_MESSAGE));
      },
    });
  });
}
