import type { SymbolKind } from "@/types";
import type { PlanFile } from "@/core/planner/types";

export interface PromptIntent {
  readonly features: readonly string[];
  readonly components: readonly string[];
  readonly screens: readonly string[];
  readonly functions: readonly string[];
  readonly keywords: readonly string[];
  readonly uiElements: readonly string[];
  readonly businessConcepts: readonly string[];
}

export interface RankedFile {
  readonly path: string;
  readonly absPath: string;
  /** Normalized 0–100 relevance score. */
  readonly score: number;
  readonly reasons: readonly string[];
  readonly primaryReason: string;
}

export interface SmartFileSelectionResult {
  readonly prompt: string;
  readonly intent: PromptIntent;
  readonly reasoning: string;
  readonly files: readonly RankedFile[];
  readonly symbols: readonly {
    name: string;
    kind: SymbolKind;
    path: string;
    line: number | null;
    reason: string;
  }[];
  readonly graphEdges: readonly {
    symbol: string;
    definedIn: string;
    referencedBy: readonly string[];
  }[];
}

export function rankedToPlanFiles(files: readonly RankedFile[]): PlanFile[] {
  return files.map((f) => ({
    path: f.path,
    absPath: f.absPath,
    score: f.score,
    reasons: [...f.reasons],
  }));
}
