import type { AppInfo } from "@/types";

/**
 * Static application metadata. Phase 1 only — no runtime configuration,
 * no remote sources, no feature flags.
 */
export const APP_INFO: AppInfo = {
  name: "BryantLabs Studio",
  phase: "Phase 23-28 — BryantLabs Agent",
  version: "0.1.0",
  tagline: "Local-first AI app builder",
};
