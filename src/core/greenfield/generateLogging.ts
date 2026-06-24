import type { ProviderId } from "@/core/providers/types";
import type { GreenfieldFilePath } from "@/core/greenfield/types";

export function logGreenfieldPreflight(opts: {
  provider: ProviderId;
  model: string;
  ok: boolean;
  reason?: string;
}): void {
  console.log(
    `[greenfield:preflight] provider=${opts.provider} model=${opts.model} ok=${opts.ok}` +
      (opts.reason ? ` reason=${opts.reason}` : ""),
  );
}

export function logGreenfieldRequest(opts: {
  provider: ProviderId;
  model: string;
  attempt: number;
  promptChars: number;
}): void {
  console.log(
    `[greenfield:request] provider=${opts.provider} model=${opts.model} attempt=${opts.attempt} promptChars=${opts.promptChars}`,
  );
}

export function logGreenfieldRetry(opts: {
  reason: string;
  attempt: number;
  missingFiles?: readonly string[];
}): void {
  console.log(
    `[greenfield:retry] attempt=${opts.attempt} reason=${opts.reason}` +
      (opts.missingFiles?.length ? ` missing=${opts.missingFiles.join(",")}` : ""),
  );
}

export function logGreenfieldJsonRepair(opts: {
  ok: boolean;
  method?: string;
  recoveredFiles?: number;
}): void {
  console.log(
    `[greenfield:json_repair] ok=${opts.ok}` +
      (opts.method ? ` method=${opts.method}` : "") +
      (opts.recoveredFiles != null ? ` files=${opts.recoveredFiles}` : ""),
  );
}

export function logGreenfieldFileValidation(opts: {
  ok: boolean;
  issues: readonly string[];
  missingFiles?: readonly GreenfieldFilePath[];
}): void {
  console.log(
    `[greenfield:file_validation] ok=${opts.ok}` +
      (opts.issues.length ? ` issues=${opts.issues.join(";")}` : "") +
      (opts.missingFiles?.length ? ` missing=${opts.missingFiles.join(",")}` : ""),
  );
}

export function logGreenfieldFallback(opts: {
  from: string;
  to: string;
  reason: string;
}): void {
  console.log(
    `[greenfield:fallback] from=${opts.from} to=${opts.to} reason=${opts.reason}`,
  );
}

export function logGreenfieldSuccess(opts: {
  provider: ProviderId;
  model: string;
  fileCount: number;
  durationMs: number;
}): void {
  console.log(
    `[greenfield:success] provider=${opts.provider} model=${opts.model} files=${opts.fileCount} durationMs=${opts.durationMs}`,
  );
}

export function logGreenfieldFailed(opts: {
  provider: ProviderId;
  model: string;
  reason: string;
  durationMs?: number;
}): void {
  console.error(
    `[greenfield:failed] provider=${opts.provider} model=${opts.model} reason=${opts.reason}` +
      (opts.durationMs != null ? ` durationMs=${opts.durationMs}` : ""),
  );
}
