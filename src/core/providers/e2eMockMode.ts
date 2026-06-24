/** True when Playwright E2E runs with deterministic mock provider in the main process. */
export function isRendererE2eMockMode(): boolean {
  const env = import.meta.env;
  if (!env) return false;
  return env.VITE_BRYANTLABS_E2E === "1";
}
