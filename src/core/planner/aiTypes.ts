import type { Confidence } from "@/core/planner/types";
import type { ProviderId } from "@/core/providers/types";
import type { PackageDependency } from "@/types";

/**
 * AI planning types (Phase 7.5).
 *
 * An AI planner produces a *plan only* — the same read-only contract as the
 * deterministic planner. No edits, patches, writes, builds, or agents.
 */

/** Compact, read-only project context sent to a provider. */
export interface PlanContext {
  framework: string;
  language: string;
  bundler?: string;
  packageManager: string;
  totalFiles: number;
  totalFolders: number;
  entryPoints: string[];
  /** Phase 19 — compact repository intelligence summary. */
  repositorySummary?: string;
  /** Phase 19 — capped package.json dependencies. */
  dependencies?: readonly PackageDependency[];
  /** Phase 19 — persisted project notes and preferences. */
  projectMemory?: {
    projectName: string;
    architecture: string;
    userPreferences: string;
    notes: string;
  };
  /** Capped list of project-relative file paths. */
  files: string[];
  /** Phase 20 — symbol graph summary for agents. */
  symbolIntelligenceSummary?: string;
  /** Capped list of symbols (name + kind + file). */
  symbols: { name: string; kind: string; path: string; line?: number }[];
  /** Phase 12 — repository intelligence for this plan request. */
  repositoryPrompt?: string;
  relevantFiles?: {
    path: string;
    score: number;
    reasons: string[];
  }[];
  relevantSymbols?: {
    name: string;
    kind: string;
    path: string;
    line?: number;
    reason: string;
  }[];
  referenceGraph?: {
    symbol: string;
    definedIn: string;
    referencedBy: string[];
  }[];
  /** Phase 22 — smart file selection diagnostics for agents. */
  fileSelection?: {
    reasoning: string;
    intent: {
      features: string[];
      components: string[];
      screens: string[];
      functions: string[];
      keywords: string[];
      uiElements: string[];
      businessConcepts: string[];
    };
    selectedFiles: {
      path: string;
      score: number;
      primaryReason: string;
      reasons: string[];
    }[];
  };
  /** Phase 14 — session memory for follow-up planning. */
  sessionMemory?: {
    branch: string | null;
    recentPrompts: string[];
    recentPlans: {
      source: "deterministic" | "ai";
      prompt: string;
      summary: string;
      files: string[];
    }[];
    recentModifiedFiles: string[];
    recentFailures: string[];
    recentAutoFixes: { summary: string; files: string[] }[];
    followUpResolution?: {
      rawPrompt: string;
      effectivePrompt: string;
      inferredSubject: string | null;
      reason: string;
    };
  };
  /** Phase 25 — ranked persistent memories injected for this request. */
  retrievedMemories?: readonly {
    id: string;
    category: string;
    title: string;
    content: string;
    relevanceScore: number;
    selectionReason: string;
  }[];
  memoryRetrievalStats?: {
    totalEstimatedTokens: number;
    hitCount: number;
    missCount: number;
    queriedCount: number;
  };
  /** Project Intelligence V1 — unified intelligence block summary. */
  projectIntelligenceSummary?: string;
  /** Active project memory block injected for edit/fix routes. */
  projectMemoryContext?: string;
  featureInventory?: readonly {
    id: string;
    label: string;
    present: boolean;
  }[];
  healthScore?: number | null;
  recentRunSummaries?: readonly unknown[];
  followUpThread?: readonly { role: string; text: string; outcome: string | null }[];
  snapshotMetadata?: readonly { index: number; label: string; createdAt: number }[];
}

export interface AIPlanFile {
  path: string;
  reason: string;
}

export interface AIPlan {
  summary: string;
  files: AIPlanFile[];
  reasoning: string;
  risks: string[];
  confidence: Confidence;
}

export type AIPlanParseFailReason =
  | "none"
  | "truncated"
  | "json_syntax"
  | "schema_validation"
  | "no_json"
  | "empty_response";

export interface AIPlanTelemetry {
  parse_fail_reason: AIPlanParseFailReason;
  truncation_detected: boolean;
  retry_success: boolean;
  retried: boolean;
  repair_attempted: boolean;
  repair_success: boolean;
}

export interface AIPlanProviderDiagnostics {
  readonly responseLength: number;
  readonly candidateCount: number;
  readonly finishReason: string | null;
  readonly safetyBlocked: boolean;
  readonly repairAttempted: boolean;
  readonly repairSucceeded: boolean;
  readonly rawResponsePreview: string | null;
  readonly providerMetadata: string | null;
  readonly repairSkippedReason: string | null;
  readonly providerHttpStatus: number | null;
  readonly providerRequestId: string | null;
  readonly providerLatency: number | null;
  readonly providerModel: string | null;
  readonly providerEndpoint: string | null;
  readonly generateMethod: string | null;
  readonly requestPayloadBytes: number | null;
  readonly maxOutputTokens: number | null;
  readonly thoughtsTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly tokenStarvationLikely: boolean | null;
  readonly tokenBudgetHint: string | null;
  readonly usageMetadata: string | null;
  readonly responseHeaders: string | null;
  readonly rawGeminiResponse: string | null;
}

export interface AIPlanAttemptRecord {
  rawText?: string;
  error?: string;
  parseError?: string;
  parseFailReason?: AIPlanParseFailReason;
  latencyMs: number;
}

export interface AIPlanResult {
  ok: boolean;
  /** Provider that actually answered (echoed — no silent switching). */
  provider: ProviderId;
  model: string;
  plan?: AIPlan;
  /** Raw provider payload, for transparency. */
  raw: unknown;
  /** Raw text the model returned (shown when JSON parsing fails). */
  rawText?: string;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
  responseBody?: string;
  apiKeyPresent?: boolean;
  /** Detailed parse/validation failure (when JSON plan extraction fails). */
  parseError?: string;
  parseFailReason?: AIPlanParseFailReason;
  telemetry?: AIPlanTelemetry;
  providerDiagnostics?: AIPlanProviderDiagnostics;
  /** First failed attempt when auto-retry also failed. */
  priorAttempt?: AIPlanAttemptRecord;
  /** Full history of failed attempts before the final response. */
  attemptHistory?: AIPlanAttemptRecord[];
}

/** ---- AI patch planning (Phase 8) — proposal only, never applied ---- */

export interface PatchSymbol {
  name: string;
  kind: string;
}

export interface PatchTargetFile {
  path: string;
  content: string;
}

/** Optional plan context for per-file patch proposals (plan apply). */
export interface PlanPatchMeta {
  readonly planSummary: string;
  readonly fileReason: string;
}

export interface AIPatchProposal {
  summary: string;
  /** The complete proposed file content (diffed against the current file). */
  newContent: string;
  reasoning: string;
  risks: string[];
}

export interface AIPatchResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  /** Project-relative path of the file the patch targets. */
  targetPath: string;
  proposal?: AIPatchProposal;
  raw: unknown;
  rawText?: string;
  latencyMs: number;
  error?: string;
}

/** Active AI patch session (Phase 9) — proposal + basis for safe apply via Phase 5. */
export interface AIPatchSession {
  readonly patch: AIPatchResult;
  /** File content when the proposal was generated (concurrency basis). */
  readonly basisContent: string;
  readonly absPath: string;
  readonly relPath: string;
  readonly proposedAt: number;
}

export type AIPatchApplyStatus = "idle" | "applying" | "applied" | "error";

/** Result of comparing the deterministic and AI plans. */
export interface PlanAgreement {
  /** 0–100 overlap of likely-affected files (basename Jaccard). */
  score: number;
  shared: string[];
  onlyDeterministic: string[];
  onlyAI: string[];
  confidenceMatch: boolean;
}
