import type { ProviderId } from "@/core/providers/types";
import {
  isFirstByteTimeoutError,
  isTotalTimeoutError,
} from "@/core/providers/reliability";

export type TimeoutKind = "first_byte" | "total" | null;

export interface SanitizedTimeoutAttempt {
  readonly attempt: number;
  readonly provider: ProviderId;
  readonly model: string;
  readonly elapsedMs: number;
  readonly timeoutKind: TimeoutKind;
  readonly payloadByteLength: number | null;
  readonly payloadSha256: string | null;
  readonly httpStatus: number | null;
  readonly providerRequestId: string | null;
  readonly responseByteLength: number | null;
}

export function timeoutKindFromError(error: string | null | undefined): TimeoutKind {
  if (isFirstByteTimeoutError(error)) return "first_byte";
  if (isTotalTimeoutError(error)) return "total";
  return null;
}

/** Lengths, hashes, and statuses only — never keys, prompts, source, or bodies. */
export function buildSanitizedTimeoutAttempt(opts: {
  readonly attempt: number;
  readonly provider: ProviderId;
  readonly model: string;
  readonly elapsedMs: number;
  readonly error?: string | null;
  readonly payloadByteLength?: number | null;
  readonly payloadSha256?: string | null;
  readonly httpStatus?: number | null;
  readonly providerRequestId?: string | null;
  readonly responseByteLength?: number | null;
}): SanitizedTimeoutAttempt {
  return {
    attempt: opts.attempt,
    provider: opts.provider,
    model: opts.model,
    elapsedMs: opts.elapsedMs,
    timeoutKind: timeoutKindFromError(opts.error),
    payloadByteLength: opts.payloadByteLength ?? null,
    payloadSha256: opts.payloadSha256 ?? null,
    httpStatus: opts.httpStatus ?? null,
    providerRequestId: opts.providerRequestId ?? null,
    responseByteLength: opts.responseByteLength ?? null,
  };
}

export function formatSanitizedTimeoutAttempt(record: SanitizedTimeoutAttempt): string {
  return [
    `attempt=${record.attempt}`,
    `provider=${record.provider}`,
    `model=${record.model}`,
    `elapsedMs=${record.elapsedMs}`,
    `timeoutKind=${record.timeoutKind ?? "none"}`,
    `payloadBytes=${record.payloadByteLength ?? "—"}`,
    `payloadSha256=${record.payloadSha256 ?? "—"}`,
    `http=${record.httpStatus ?? "—"}`,
    `providerRequestId=${record.providerRequestId ?? "—"}`,
    `responseBytes=${record.responseByteLength ?? "—"}`,
  ].join(" ");
}
