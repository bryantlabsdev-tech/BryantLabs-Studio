import type { VerificationResult } from "@/types";

export interface ProjectHealthSnapshot {
  readonly score: number;
  readonly typecheckOk: boolean;
  readonly buildOk: boolean;
  readonly previewOk: boolean;
  readonly warnings: number;
  readonly errors: number;
  readonly updatedAt: number;
}

export function computeProjectHealth(
  verification: VerificationResult | null,
  previewReady: boolean,
): ProjectHealthSnapshot {
  const typecheckOk = verification?.typecheck?.ok ?? false;
  const buildOk = verification?.build?.ok ?? false;
  const previewOk = previewReady;
  const errors =
    (verification?.typecheck?.ok === false ? 1 : 0) +
    (verification?.build?.ok === false ? 1 : 0) +
    (previewReady ? 0 : verification ? 1 : 0);
  const warnings = 0;

  let score = 5;
  if (typecheckOk) score += 2.5;
  if (buildOk) score += 2;
  if (previewOk) score += 0.9;
  score -= errors * 1.5;
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return {
    score,
    typecheckOk,
    buildOk,
    previewOk,
    warnings,
    errors,
    updatedAt: Date.now(),
  };
}
