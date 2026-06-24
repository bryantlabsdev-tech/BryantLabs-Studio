export const GREENFIELD_PHASE_MAX_OUTPUT_TOKENS = 8192;
export const GREENFIELD_PHASE_MAX_OUTPUT_TOKENS_THINKING = 16384;

export function resolveGreenfieldPhaseMaxOutputTokens(
  geminiModel: string | undefined,
): number {
  if (/2\.5-pro|thinking/i.test(geminiModel ?? "")) {
    return GREENFIELD_PHASE_MAX_OUTPUT_TOKENS_THINKING;
  }
  return GREENFIELD_PHASE_MAX_OUTPUT_TOKENS;
}
