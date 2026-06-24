/**
 * Planner types (Phase 4).
 *
 * The planner is a pure, deterministic, provider-agnostic module. It produces a
 * read-only modification *plan* — it never edits, generates, or executes code,
 * and it makes no network or model calls.
 */

export type Confidence = "High" | "Medium" | "Low";
export type Impact = "Low" | "Medium" | "High";

export interface PlanFile {
  /** Project-relative path. */
  path: string;
  /** Absolute path (used to open the file read-only). */
  absPath: string;
  /** Heuristic relevance score. */
  score: number;
  /** Human-readable reasons this file was selected. */
  reasons: string[];
}

export interface Plan {
  prompt: string;
  /** Detected intent label, e.g. "Theme / dark mode". */
  intent: string;
  summary: string;
  files: PlanFile[];
  proposedChanges: string[];
  confidence: Confidence;
  impact: Impact;
  createdAt: number;
  /** True when files were chosen via React/CSS fallback rules. */
  usedFallback?: boolean;
}
