import type { RawProviderSettings } from "./settings.cjs";

const PATCH_MAX_OUTPUT_STANDARD = 16384;
const PATCH_MAX_OUTPUT_ECONOMY_SINGLE = 8192;
const PATCH_MAX_OUTPUT_ECONOMY_MULTI = 12288;

export function isEconomyCostMode(raw: Pick<RawProviderSettings, "costMode">): boolean {
  return raw.costMode === "economy";
}

/** Lower patch output caps in economy mode to reduce output-token spend. */
export function resolvePatchMaxOutputTokens(
  raw: Pick<RawProviderSettings, "costMode">,
  fileCount: number,
): number {
  if (!isEconomyCostMode(raw)) return PATCH_MAX_OUTPUT_STANDARD;
  if (fileCount <= 1) return PATCH_MAX_OUTPUT_ECONOMY_SINGLE;
  return PATCH_MAX_OUTPUT_ECONOMY_MULTI;
}
