import type { RepositorySearchHit } from "@/core/repository/types";
import type { SymbolReferenceInfo } from "@/core/repository/types";

export type AgentLoopMode = "investigation" | "goal";

export type AgentLoopStatus =
  | "idle"
  | "running"
  | "paused"
  | "awaiting_approval"
  | "completed"
  | "stopped"
  | "failed";

export type AgentActionType =
  | "search_files"
  | "grep_content"
  | "read_file"
  | "search_symbols"
  | "find_references"
  | "run_command"
  | "invoke_mcp_tool"
  | "create_plan"
  | "modify_files"
  | "run_verification"
  | "run_auto_fix"
  | "request_user_input"
  | "complete_task";

export interface AgentActionParams {
  readonly query?: string;
  readonly path?: string;
  readonly symbol?: string;
  readonly message?: string;
  readonly command?: string;
  readonly tool?: string;
  readonly argsJson?: string;
}

export interface AgentReasoningStep {
  readonly id: string;
  readonly thought: string;
  readonly reason: string;
  readonly action: AgentActionType;
  readonly actionDetail: string;
  readonly result: string | null;
  readonly ok: boolean;
  readonly at: number;
}

export type AgentTaskStatus =
  | "pending"
  | "active"
  | "done"
  | "removed";

export interface AgentDynamicTask {
  readonly id: string;
  title: string;
  status: AgentTaskStatus;
  order: number;
}

export interface AgentFlags {
  searchedTerms: string[];
  readPaths: string[];
  readFileContents: Record<string, string>;
  grepQueries: string[];
  symbolHits: readonly RepositorySearchHit[];
  referenceSymbol: string | null;
  planCreated: boolean;
  planAttempts: number;
  planLastError: string | null;
  plannedFileCount: number;
  plannedNewFileCount: number;
  executionDone: boolean;
  autoFixAttempts: number;
  lastVerificationOk: boolean | null;
  investigationComplete: boolean;
  rootCause: string | null;
  completionSummary: string | null;
  commandsRun: string[];
  mcpToolsInvoked: string[];
}

export interface AgentPendingApproval {
  readonly action: AgentActionType;
  readonly params: AgentActionParams;
  readonly summary: string;
}

export interface AgentLoopSession {
  readonly goal: string;
  readonly mode: AgentLoopMode;
  status: AgentLoopStatus;
  readonly startedAt: number;
  endedAt: number | null;
  iteration: number;
  readonly maxIterations: number;
  dynamicTasks: AgentDynamicTask[];
  observations: string[];
  reasoningLog: AgentReasoningStep[];
  pendingApproval: AgentPendingApproval | null;
  flags: AgentFlags;
}

export interface AgentThinkResult {
  readonly thought: string;
  readonly reason: string;
  readonly action: AgentActionType;
  readonly params: AgentActionParams;
  readonly actionDetail: string;
}

export interface AgentActResult {
  readonly ok: boolean;
  readonly observation: string;
  readonly done?: boolean;
  readonly needsApproval?: boolean;
  readonly approvalSummary?: string;
}

export type AgentSearchHit = RepositorySearchHit;
export type AgentReference = SymbolReferenceInfo;
