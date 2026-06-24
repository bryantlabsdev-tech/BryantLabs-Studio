import type { PlanContext } from "@/core/planner/aiTypes";
import type { ProviderId } from "@/core/providers/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { ProjectScan } from "@/types";

export type ContextTaskType =
  | "ui_edit"
  | "gameplay_edit"
  | "apply_plan"
  | "repair"
  | "planner"
  | "greenfield"
  | "generic";

export interface ContextPatchFile {
  readonly path: string;
  readonly content: string;
}

export interface ContextBuildInput {
  readonly userPrompt: string;
  readonly planSummary?: string;
  readonly taskType?: ContextTaskType;
  readonly scan: ProjectScan;
  readonly projectMemory?: ProjectMemory | null;
  readonly patchFiles?: readonly ContextPatchFile[];
  readonly uiAuditSummary?: string | null;
  readonly provider?: ProviderId;
  readonly compressed?: boolean;
  readonly directRewrite?: boolean;
}

export interface ContextPackage {
  readonly userPrompt: string;
  readonly taskType: ContextTaskType;
  readonly context: PlanContext;
  readonly patchFiles: ContextPatchFile[];
  readonly planSummary: string;
  readonly intelligenceBlock: string;
  readonly contextNotes: string;
  readonly slimContext: boolean;
  readonly uiEditMode: boolean;
  readonly includedFiles: readonly string[];
  readonly promptPreview: string;
  readonly estimatedTokens: number;
  readonly compressed: boolean;
  readonly appClassNames: readonly string[];
}

export interface ContextFailureMeta {
  readonly failure_type: "request_too_large";
  readonly estimated_tokens: number;
  readonly provider_limit: number;
  readonly compression_attempted: boolean;
}

export interface TokenBudgetResult {
  readonly package: ContextPackage;
  readonly withinLimit: boolean;
  readonly limit: number;
  readonly compressionActions: readonly string[];
}
