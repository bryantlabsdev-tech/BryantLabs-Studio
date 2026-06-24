import {
  GREENFIELD_FILE_PATHS,
  type GreenfieldFilePath,
} from "@/core/greenfield/types";

export function formatGreenfieldParseIncompleteMessage(
  parsedCount: number,
  missingFiles: readonly GreenfieldFilePath[],
  opts?: { attemptingRepair?: boolean },
): string {
  const expected = GREENFIELD_FILE_PATHS.length;
  const missing =
    missingFiles.length > 0 ? missingFiles.join(", ") : "(none listed)";
  const base = `Greenfield parse incomplete: parsed ${parsedCount}/${expected} expected files. Missing: [${missing}].`;
  if (opts?.attemptingRepair) {
    return `${base} Attempting repair.`;
  }
  return base;
}

export const PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE =
  "Provider unavailable/degraded and no backup provider returned usable output.";

export const PROVIDER_OUTPUT_PARSER_ZERO_MESSAGE =
  "Provider returned output but parser found 0 file blocks.";

export function classifyGreenfieldProviderNoOutput(
  reason?: string,
  backupAvailable?: boolean,
  backupAttempted?: boolean,
): string {
  const lower = (reason ?? "").toLowerCase();
  const degraded = /degraded|offline|unavailable|not connected|temporarily degraded/i.test(
    lower,
  );
  if (degraded) {
    if (backupAttempted === false && backupAvailable === false) {
      return `${PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE} No backup provider configured.`;
    }
    if (backupAttempted && backupAvailable) {
      return `${PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE} Backup was attempted but returned no usable output.`;
    }
    if (backupAvailable === false) {
      return `${PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE} No backup provider configured.`;
    }
    return PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE;
  }
  if (reason?.trim()) return reason.trim();
  return PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE;
}

export function classifyGreenfieldParserZeroFiles(rawLength: number): string {
  if (rawLength > 0) return PROVIDER_OUTPUT_PARSER_ZERO_MESSAGE;
  return PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE;
}

export function classifyProviderStopReason(
  reason: string,
): { stage: string; message: string } {
  const lower = reason.toLowerCase();
  if (/budget|max ai calls|ai call limit/i.test(lower)) {
    return { stage: "budget", message: reason };
  }
  if (/missing.*api key|api key not configured|no api key/i.test(lower)) {
    return { stage: "preflight", message: reason };
  }
  if (/preflight|model mismatch|model missing|request too large/i.test(lower)) {
    return { stage: "preflight", message: reason };
  }
  if (/rate limit|cooldown|429/i.test(lower)) {
    return { stage: "rate_limited", message: reason };
  }
  if (/cancel|declined|fallback declined/i.test(lower)) {
    return { stage: "cancelled", message: reason };
  }
  if (/degraded|offline|unavailable|not connected/i.test(lower)) {
    return { stage: "provider_unavailable", message: reason };
  }
  if (/unsupported|unknown provider/i.test(lower)) {
    return { stage: "model_unsupported", message: reason };
  }
  return { stage: "provider_blocked", message: reason };
}
