import type { BryantLabsApi, ProjectScan } from "@/types";
import type { AgentMemoryStore } from "@/core/memory/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { ProjectHealthSnapshot } from "@/core/build/projectHealth";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { FollowUpSnapshot } from "@/core/build/followUpSnapshots";
import type { MemoryRetrievalResult } from "@/core/memory/types";
import { buildProjectIntelligenceContext } from "./buildContext";
import { buildFeatureInventoryFromScan } from "./featureInventory";
import { analyzeFeasibility } from "./feasibility";
import { resolveComplexityRouting } from "./complexityRouting";
import type {
  FeatureInventorySnapshot,
  FeasibilityResult,
  ComplexityRoutingDecision,
  ProjectIntelligenceContext,
  ProjectIntelligenceMeta,
} from "./types";
import type { ProviderSettings } from "@/core/providers/types";

export interface ProjectBrainSnapshot {
  readonly scan: ProjectScan | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly projectMemory: ProjectMemory | null;
  readonly agentMemory: AgentMemoryStore | null;
  readonly featureInventory: FeatureInventorySnapshot | null;
  readonly health: ProjectHealthSnapshot | null;
  readonly followUpChat: readonly FollowUpChatMessage[];
  readonly snapshots: readonly FollowUpSnapshot[];
}

export class ProjectIntelligenceService {
  private scan: ProjectScan | null = null;
  private sessionMemory: SessionMemorySnapshot;
  private projectMemory: ProjectMemory | null = null;
  private agentMemory: AgentMemoryStore | null = null;
  private featureInventory: FeatureInventorySnapshot | null = null;
  private health: ProjectHealthSnapshot | null = null;
  private followUpChat: readonly FollowUpChatMessage[] = [];
  private snapshots: readonly FollowUpSnapshot[] = [];

  constructor(sessionMemory: SessionMemorySnapshot) {
    this.sessionMemory = sessionMemory;
  }

  update(input: Partial<Omit<ProjectBrainSnapshot, "scan">> & { scan?: ProjectScan | null }) {
    if (input.scan !== undefined) this.scan = input.scan;
    if (input.sessionMemory !== undefined) this.sessionMemory = input.sessionMemory;
    if (input.projectMemory !== undefined) this.projectMemory = input.projectMemory;
    if (input.agentMemory !== undefined) this.agentMemory = input.agentMemory;
    if (input.featureInventory !== undefined) this.featureInventory = input.featureInventory;
    if (input.health !== undefined) this.health = input.health;
    if (input.followUpChat !== undefined) this.followUpChat = input.followUpChat;
    if (input.snapshots !== undefined) this.snapshots = input.snapshots;
  }

  getProjectBrain(): ProjectBrainSnapshot {
    return {
      scan: this.scan,
      sessionMemory: this.sessionMemory,
      projectMemory: this.projectMemory,
      agentMemory: this.agentMemory,
      featureInventory: this.featureInventory,
      health: this.health,
      followUpChat: this.followUpChat,
      snapshots: this.snapshots,
    };
  }

  getFeatureInventory(): FeatureInventorySnapshot | null {
    return this.featureInventory;
  }

  getArchitectureSummary(): string {
    if (!this.scan) return "No scan available.";
    return this.scan.repositorySummary?.trim() || this.scan.summary.framework;
  }

  getProjectContext(
    userPrompt?: string,
    memoryRetrieval?: MemoryRetrievalResult | null,
  ): ProjectIntelligenceContext {
    return buildProjectIntelligenceContext(
      {
        scan: this.scan,
        sessionMemory: this.sessionMemory,
        projectMemory: this.projectMemory,
        agentMemory: this.agentMemory,
        featureInventory: this.featureInventory,
        health: this.health,
        followUpChat: this.followUpChat,
        snapshots: this.snapshots,
        ...(userPrompt !== undefined ? { userPrompt } : {}),
      },
      memoryRetrieval,
    );
  }

  rebuildFeatureInventoryFromScan(projectPath: string): FeatureInventorySnapshot | null {
    if (!this.scan) return null;
    this.featureInventory = buildFeatureInventoryFromScan(this.scan, projectPath);
    return this.featureInventory;
  }

  analyzeFeasibility(prompt: string): FeasibilityResult {
    return analyzeFeasibility(prompt, this.featureInventory);
  }

  resolveRouting(
    prompt: string,
    fileCount: number,
    settings: ProviderSettings,
  ): ComplexityRoutingDecision {
    return resolveComplexityRouting({
      prompt,
      fileCount,
      featureInventory: this.featureInventory,
      settings,
    });
  }
}

export async function loadFeatureInventoryFromDisk(
  api: BryantLabsApi | undefined,
  projectPath: string,
): Promise<FeatureInventorySnapshot | null> {
  if (!api?.readFeatureInventory || !projectPath) return null;
  try {
    return await api.readFeatureInventory();
  } catch {
    return null;
  }
}

export async function saveFeatureInventoryToDisk(
  api: BryantLabsApi | undefined,
  inventory: FeatureInventorySnapshot,
): Promise<void> {
  if (!api?.writeFeatureInventory) return;
  await api.writeFeatureInventory(inventory);
}

export function mergeIntelligenceIntoPlanContext(
  base: import("@/core/planner/aiTypes").PlanContext,
  intel: ProjectIntelligenceContext,
): import("@/core/planner/aiTypes").PlanContext {
  return {
    ...base,
    ...(intel.planContextPatch as Partial<import("@/core/planner/aiTypes").PlanContext>),
  };
}

export type { ProjectIntelligenceMeta, ProjectIntelligenceContext, FeasibilityResult };
