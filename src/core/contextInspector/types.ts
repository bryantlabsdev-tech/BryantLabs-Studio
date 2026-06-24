import type { PlanContext } from "@/core/planner/aiTypes";
import type { AgentMode, ProviderId } from "@/core/providers/types";
import type { PackageDependency } from "@/types";

export type ContextOperation =
  | "ai_plan"
  | "apply_plan"
  | "ai_patch"
  | "agent"
  | "pipeline_planner"
  | "pipeline_coder"
  | "pipeline_repair";

export type ContextWarningLevel = "info" | "warn" | "error";

export interface ContextWarning {
  readonly level: ContextWarningLevel;
  readonly message: string;
}

export interface ContextTokenMetrics {
  readonly promptTokens: number;
  readonly contextTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedTotalTokens: number;
  readonly contextWindowTokens: number;
  readonly contextWindowUsagePercent: number;
}

export interface ContextPromptSection {
  readonly original: string;
  readonly expanded: string;
}

export interface ContextRepositorySection {
  readonly summary: string;
  readonly framework: string;
  readonly language: string;
  readonly bundler: string;
  readonly packageManager: string;
  readonly fileCount: number;
  readonly componentCount: number;
  readonly dependencies: readonly PackageDependency[];
}

export interface ContextRetrievedMemory {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly content: string;
  readonly relevanceScore: number;
  readonly selectionReason: string;
  readonly estimatedTokens: number;
}

export interface ContextMemorySection {
  readonly projectName: string;
  readonly architecture: string;
  readonly preferences: string;
  readonly notes: string;
  readonly hasContent: boolean;
  readonly retrievedMemories: readonly ContextRetrievedMemory[];
  readonly retrievalTokens: number;
  readonly retrievalHitCount: number;
  readonly retrievalMissCount: number;
}

export interface ContextSelectedFile {
  readonly path: string;
  readonly score: number;
  readonly primaryReason: string;
  readonly reasons: readonly string[];
}

export interface ContextFileSelectionSection {
  readonly reasoning: string;
  readonly intentSummary: string;
  readonly selectedFiles: readonly ContextSelectedFile[];
}

export interface ContextSymbolSection {
  readonly intelligenceSummary: string;
  readonly relevantComponents: readonly string[];
  readonly relevantFunctions: readonly string[];
  readonly relevantHooks: readonly string[];
  readonly relevantTypes: readonly string[];
  readonly relevantFiles: readonly {
    path: string;
    score: number;
    reasons: readonly string[];
  }[];
  readonly relevantSymbols: readonly {
    name: string;
    kind: string;
    path: string;
    line?: number;
    reason: string;
  }[];
}

export interface ContextOrchestrationSection {
  readonly agentMode: AgentMode;
  readonly stage: string | null;
  readonly routingSummary: string;
  readonly estimatedAiCalls: number | null;
  readonly maxRepairAttempts: number;
  readonly fallbackPolicy: string;
  readonly providerHealthAtStart?: Readonly<Partial<Record<ProviderId, string>>>;
  readonly providerFailureSummary?: string | null;
}

export interface ContextSnapshot {
  readonly id: string;
  readonly at: number;
  readonly projectPath: string | null;
  readonly operation: ContextOperation;
  readonly provider: ProviderId;
  readonly model: string;
  readonly orchestration: ContextOrchestrationSection;
  readonly prompt: ContextPromptSection;
  readonly repository: ContextRepositorySection;
  readonly memory: ContextMemorySection;
  readonly symbols: ContextSymbolSection;
  readonly fileSelection: ContextFileSelectionSection;
  readonly warnings: readonly ContextWarning[];
  readonly metrics: ContextTokenMetrics;
  /** Exact PlanContext JSON sent to the provider (secrets redacted). */
  readonly finalPayload: PlanContext;
  /** Human-readable provider request preview (secrets redacted). */
  readonly requestPreview: string;
}

export interface CaptureContextInput {
  readonly operation: ContextOperation;
  readonly provider: ProviderId;
  readonly model: string;
  readonly originalPrompt: string;
  readonly expandedPrompt: string;
  readonly planContext: PlanContext;
  readonly projectPath: string | null;
  readonly repository: ContextRepositorySection;
  readonly memory: ContextMemorySection;
  readonly requestPreview: string;
  readonly hasScan: boolean;
  readonly orchestration: ContextOrchestrationSection;
}
