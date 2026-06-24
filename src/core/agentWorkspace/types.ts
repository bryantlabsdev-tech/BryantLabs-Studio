export type AgentFeedKind =
  | "thinking"
  | "planning"
  | "executing"
  | "verifying"
  | "repairing"
  | "completed";

export type AgentSessionStatus =
  | "idle"
  | "active"
  | "paused"
  | "completed"
  | "stopped";

export type AgentHistoryCategory =
  | "prompt"
  | "plan"
  | "execution"
  | "verification"
  | "auto_fix"
  | "reasoning";

export interface AgentReasoningEntry {
  readonly id: string;
  readonly thought: string;
  readonly reason: string;
  readonly action: string;
  readonly result: string | null;
  readonly ok: boolean;
  readonly at: number;
}

export type AgentTimelineStatus = "pending" | "active" | "done" | "failed";

export interface AgentFeedEntry {
  readonly id: string;
  readonly kind: AgentFeedKind;
  readonly title: string;
  readonly detail: string | null;
  readonly at: number;
  readonly active: boolean;
}

export interface AgentFileDecision {
  readonly path: string;
  readonly reason: string;
  readonly at: number;
}

export interface AgentHistoryEntry {
  readonly id: string;
  readonly category: AgentHistoryCategory;
  readonly title: string;
  readonly detail: string | null;
  readonly at: number;
}

export interface AgentTimelineStage {
  readonly id: string;
  readonly label: string;
  status: AgentTimelineStatus;
}

export interface AgentContextSnapshot {
  goal: string | null;
  phase: string | null;
  task: string | null;
  file: string | null;
  model: string | null;
  tokens: string | null;
}

export interface AgentArtifacts {
  filesCreated: string[];
  filesModified: string[];
  errorsFixed: string[];
  verificationResults: string[];
}

export interface AgentWorkspaceSession {
  readonly startedAt: number;
  endedAt: number | null;
  status: AgentSessionStatus;
  feed: AgentFeedEntry[];
  context: AgentContextSnapshot;
  decisions: AgentFileDecision[];
  history: AgentHistoryEntry[];
  reasoning: AgentReasoningEntry[];
  artifacts: AgentArtifacts;
  timeline: AgentTimelineStage[];
}

export interface AgentReport {
  readonly goal: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly durationMs: number;
  readonly plans: readonly string[];
  readonly executions: readonly string[];
  readonly verifications: readonly string[];
  readonly autoFixes: readonly string[];
  readonly filesCreated: readonly string[];
  readonly filesModified: readonly string[];
  readonly errorsFixed: readonly string[];
  readonly feedSummary: readonly string[];
}
