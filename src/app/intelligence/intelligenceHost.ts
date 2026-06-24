import type { MemoryRetrievalResult } from "@/core/memory/types";
import type { ProviderSettings } from "@/core/providers/types";
import type { ProjectIntelligenceContext } from "@/core/intelligence/types";
import type { FeasibilityResult, ComplexityRoutingDecision } from "@/core/intelligence";

export interface IntelligenceHostBridge {
  buildIntelligenceForOperation(opts: {
    prompt: string;
    operation: "ai_plan" | "apply_plan" | "auto_fix" | "pipeline_planner" | "pipeline_coder";
    memoryRetrieval?: MemoryRetrievalResult | null;
  }): ProjectIntelligenceContext;
  applyComplexityRouting(
    prompt: string,
    fileCount: number,
    settings: ProviderSettings,
  ): Promise<{
    settings: ProviderSettings;
    decision: ComplexityRoutingDecision;
  }>;
  persistSessionMemory(): Promise<void>;
  refreshFeatureInventory(): Promise<void>;
  recordPromptSent(opts: {
    stage: "planner" | "coder" | "repair";
    prompt: string;
    provider: string | null;
    model: string | null;
  }): void;
  analyzeFeasibility(prompt: string): FeasibilityResult;
}

let bridge: IntelligenceHostBridge | null = null;

export function setIntelligenceHost(next: IntelligenceHostBridge | null): void {
  bridge = next;
}

export function getIntelligenceHost(): IntelligenceHostBridge | null {
  return bridge;
}
