/** Test-only prompt/diagnostic capture. Production builds never enable this. */
export function isStudioTestCaptureEnabled(): boolean {
  const env = import.meta.env;
  if (!env) return false;
  return env.VITE_BRYANTLABS_E2E === "1" || env.MODE === "test";
}
