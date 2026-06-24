import {
  collectVerificationFailures,
  formatFailureLine,
  pickPrimaryFailure,
} from "@/core/autoFix/failureDetection";
import type { AutoFixContext, FailureDiagnostic } from "@/core/autoFix/types";
import { MAX_AUTO_FIX_ATTEMPTS } from "@/core/autoFix/types";
import type { VerificationResult } from "@/types";

export function buildAutoFixContext(opts: {
  verification: VerificationResult;
  originalRequest: string;
  planSummary: string;
  planSource: string;
  modifiedFiles: readonly string[];
  attemptNumber: number;
  projectRoot?: string;
  maxAttempts?: number;
  strictFormat?: boolean;
}): AutoFixContext | null {
  const diagnostics = collectVerificationFailures(
    opts.verification,
    opts.projectRoot,
  );
  const primaryFailure = pickPrimaryFailure(diagnostics);
  if (!primaryFailure) return null;

  return {
    originalRequest: opts.originalRequest,
    planSummary: opts.planSummary,
    planSource: opts.planSource,
    modifiedFiles: opts.modifiedFiles,
    diagnostics,
    primaryFailure,
    attemptNumber: opts.attemptNumber,
    maxAttempts: opts.maxAttempts ?? MAX_AUTO_FIX_ATTEMPTS,
    ...(opts.strictFormat !== undefined ? { strictFormat: opts.strictFormat } : {}),
  };
}

/** Serialize for IPC to the main-process auto-fix prompt builder. */
export function serializeAutoFixContext(context: AutoFixContext): AutoFixContext {
  return {
    originalRequest: context.originalRequest,
    planSummary: context.planSummary,
    planSource: context.planSource,
    modifiedFiles: [...context.modifiedFiles],
    diagnostics: context.diagnostics.map((d) => ({
      kind: d.kind,
      file: d.file,
      line: d.line,
      column: d.column,
      message: d.message,
      ...(d.code !== undefined ? { code: d.code } : {}),
    })),
    primaryFailure: {
      kind: context.primaryFailure.kind,
      file: context.primaryFailure.file,
      line: context.primaryFailure.line,
      column: context.primaryFailure.column,
      message: context.primaryFailure.message,
      ...(context.primaryFailure.code !== undefined
        ? { code: context.primaryFailure.code }
        : {}),
    },
    attemptNumber: context.attemptNumber,
    maxAttempts: context.maxAttempts,
    ...(context.intelligenceBlock !== undefined
      ? { intelligenceBlock: context.intelligenceBlock }
      : {}),
    ...(context.strictFormat !== undefined
      ? { strictFormat: context.strictFormat }
      : {}),
    ...(context.relatedTypeDefinitions !== undefined
      ? { relatedTypeDefinitions: context.relatedTypeDefinitions }
      : {}),
  };
}

export function formatOriginalFailureSummary(
  diagnostics: readonly FailureDiagnostic[],
  rootCauseLine: string,
): string {
  const lines = [rootCauseLine, ""];
  if (diagnostics.length > 0) {
    lines.push("Captured diagnostics:");
    for (const d of diagnostics.slice(0, 8)) {
      lines.push(`  • ${formatFailureLine(d)} (${d.kind})`);
    }
  }
  return lines.join("\n");
}
