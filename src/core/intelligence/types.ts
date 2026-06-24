import type { ProjectHealthSnapshot } from "@/core/build/projectHealth";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { FollowUpSnapshot } from "@/core/build/followUpSnapshots";
import type { AgentMemoryStore } from "@/core/memory/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { ProjectScan } from "@/types";

export interface FeatureInventoryItem {
  readonly id: string;
  readonly label: string;
  readonly present: boolean;
  readonly evidence: readonly string[];
}

export interface FeatureInventorySnapshot {
  readonly projectPath: string;
  readonly updatedAt: number;
  readonly features: readonly FeatureInventoryItem[];
}

export interface FeasibilityRequirement {
  readonly id: string;
  readonly label: string;
  readonly satisfied: boolean;
}

export interface FeasibilityRuleTrace {
  readonly ruleId: string;
  readonly matchedPattern: string | null;
  readonly matchedRuleId: string | null;
  readonly addsLabels: readonly string[];
}

export interface FeasibilityResult {
  readonly prompt: string;
  readonly requiresConfirmation: boolean;
  readonly requirements: readonly FeasibilityRequirement[];
  readonly missingLabels: readonly string[];
  readonly headline: string;
  readonly detail: string;
  /** Which rules matched and what they added (for Console debugging). */
  readonly traces?: readonly FeasibilityRuleTrace[];
}

export interface ComplexityRoutingDecision {
  readonly score: number;
  readonly tier: "small_ui" | "feature_addition" | "auth_database" | "architecture" | "large_app";
  readonly provider: import("@/core/providers/types").ProviderId;
  readonly model: string;
  readonly reason: string;
}

export interface ProjectIntelligenceInput {
  readonly scan: ProjectScan | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemory: ProjectMemory | null;
  readonly agentMemory: AgentMemoryStore | null;
  readonly featureInventory: FeatureInventorySnapshot | null;
  readonly health: ProjectHealthSnapshot | null;
  readonly followUpChat: readonly FollowUpChatMessage[];
  readonly snapshots: readonly FollowUpSnapshot[];
  readonly userPrompt?: string;
}

export interface ProjectIntelligenceMeta {
  readonly architectureSummary: string;
  readonly scanSummary: string;
  readonly featureCount: number;
  readonly presentFeatureCount: number;
  readonly healthScore: number | null;
  readonly recentChanges: readonly string[];
}

export interface ProjectIntelligenceContext {
  readonly meta: ProjectIntelligenceMeta;
  readonly promptBlock: string;
  readonly planContextPatch: Record<string, unknown>;
}

export interface PromptVisibilityEntry {
  readonly stage: "planner" | "coder" | "repair";
  readonly at: number;
  readonly provider: string | null;
  readonly model: string | null;
  readonly prompt: string;
}
