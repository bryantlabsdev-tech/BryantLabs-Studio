import type { ProviderSettings } from "@/core/providers/types";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import type { VerificationResult } from "@/types";

export function activeProviderModel(settings: ProviderSettings): string {
  return modelForProvider(settings, settings.provider);
}

/** User-facing name for the agent workflow (internal id remains `studio_agent`). */
export const BRYANTLABS_AGENT_DISPLAY_NAME = "BryantLabs Agent";

/** Kind of Studio workflow reflected in Summary / Logs. */
export type StudioActionType =
  | "idle"
  | "greenfield"
  | "ai_plan"
  | "apply_plan"
  | "multi_file_execution"
  | "autonomous_builder"
  | "studio_agent"
  | "ai_patch_propose"
  | "ai_patch_apply"
  | "multi_agent_pipeline"
  | "safe_edit"
  | "verification"
  | "preview";

export const STUDIO_ACTION_LABELS: Record<StudioActionType, string> = {
  idle: "Idle",
  greenfield: "New App",
  ai_plan: "AI Plan",
  apply_plan: "Apply Plan",
  multi_file_execution: "Multi-File Execution",
  autonomous_builder: "Autonomous Builder",
  studio_agent: BRYANTLABS_AGENT_DISPLAY_NAME,
  ai_patch_propose: "AI Patch (propose)",
  ai_patch_apply: "AI Patch (apply)",
  multi_agent_pipeline: "Multi-Agent Pipeline",
  safe_edit: "Safe Edit",
  verification: "Verification",
  preview: "Preview",
};

/** Per-action metrics shown in Summary when not a greenfield run. */
export interface StudioWorkflowDetails {
  readonly prompt?: string;
  readonly planSource?: string;
  readonly planSummary?: string;
  readonly filesProposed?: number;
  readonly filesAccepted?: number;
  readonly filesWritten?: readonly string[];
  readonly linesAdded?: number;
  readonly linesRemoved?: number;
  readonly verificationOk?: boolean;
  readonly patchTarget?: string;
  readonly editTarget?: string;
  readonly typecheckResult?: string | null;
  readonly buildResult?: string | null;
  readonly previewResult?: string | null;
  readonly errors?: readonly string[];
  readonly contextFailure?: {
    readonly failure_type: "request_too_large";
    readonly estimated_tokens: number;
    readonly provider_limit: number;
    readonly compression_attempted: boolean;
  };
  readonly routingIntent?: {
    readonly intent: "feature_addition" | "small_ui";
    readonly reason: string;
    readonly files_allowed?: readonly string[];
    readonly files_written?: readonly string[];
  };
}

export function verificationSummaryLines(
  v: VerificationResult | null | undefined,
): { typecheck: string | null; build: string | null; ok: boolean } {
  if (!v) {
    return { typecheck: null, build: null, ok: false };
  }
  const typecheck = v.typecheck.ok
    ? "passed"
    : `failed (exit ${v.typecheck.exitCode ?? "—"})`;
  const build = v.build.ok
    ? "passed"
    : `failed (exit ${v.build.exitCode ?? "—"})`;
  return {
    typecheck,
    build,
    ok: v.typecheck.ok && v.build.ok,
  };
}
