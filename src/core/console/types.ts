import type { RunLogStage, RunLogStatus } from "@/core/greenfield/runLog";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type { StudioIntentKind } from "@/core/agent/classifyStudioIntent";

export type ConsoleLogCategory =
  | "all"
  | "ai"
  | "files"
  | "build"
  | "repair"
  | "preview"
  | "errors"
  | "system";

export type GraphNodeId =
  | "prompt"
  | "intent_router"
  | "planner"
  | "coder"
  | "patch_apply"
  | "typescript"
  | "build"
  | "preview";

export type GraphNodeState = "waiting" | "running" | "success" | "failed";

export interface ExecutionGraphNode {
  readonly id: GraphNodeId;
  readonly label: string;
  readonly state: GraphNodeState;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
}

export interface ConsoleLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly title: string;
  readonly category: Exclude<ConsoleLogCategory, "all">;
  readonly status: RunLogStatus | "info";
  readonly fields: Readonly<Record<string, string>>;
  readonly details?: string;
  readonly rawError?: string;
  readonly filePath?: string;
  readonly lineNumber?: number;
  readonly runId: string;
}

export interface ConsoleRunMetadata {
  readonly runId: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly elapsedMs: number;
  readonly currentStage: string | null;
  readonly currentFile: string | null;
  readonly estimatedAiCalls: number;
  readonly aiCallsUsed: number;
  readonly startedAt: number | null;
  readonly status: "idle" | "running" | "success" | "failed" | "cancelled";
}

export interface ConsoleFailureDiagnostic {
  readonly rootCause: string;
  readonly rawError: string;
  readonly filePath: string | null;
  readonly lineNumber: number | null;
  readonly errorCode: string | null;
  readonly retryActions: readonly string[];
}

export interface PersistedConsoleRun {
  readonly id: string;
  readonly projectPath: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly status: "running" | "success" | "failed" | "cancelled";
  readonly provider: string | null;
  readonly model: string | null;
  readonly entries: readonly ConsoleLogEntry[];
  readonly metadata: ConsoleRunMetadata;
  readonly failureDiagnostic: ConsoleFailureDiagnostic | null;
  readonly graph: readonly ExecutionGraphNode[];
}

export type StudioEventType =
  | "intent.classified"
  | "run.blocked"
  | "run.started"
  | "run.completed"
  | "run.cancelled"
  | "run.log"
  | "greenfield.stage"
  | "ai.call"
  | "provider.fallback"
  | "failure.reported"
  | "metadata.updated";

export interface StudioEventBase {
  readonly type: StudioEventType;
  readonly timestamp: number;
  readonly projectPath: string | null;
}

export interface IntentClassifiedEvent extends StudioEventBase {
  readonly type: "intent.classified";
  readonly intent: StudioIntentKind;
  readonly reason?: string;
}

export interface RunBlockedEvent extends StudioEventBase {
  readonly type: "run.blocked";
  readonly reason: string;
}

export interface RunLifecycleEvent extends StudioEventBase {
  readonly type: "run.started" | "run.completed" | "run.cancelled";
  readonly actionType?: string;
  readonly ok?: boolean;
  readonly message?: string;
}

export interface RunLogBridgeEvent extends StudioEventBase {
  readonly type: "run.log";
  readonly runId: string;
  readonly stage: RunLogStage;
  readonly status: RunLogStatus;
  readonly message: string;
  readonly details?: string;
  readonly provider?: string | null;
  readonly model?: string | null;
}

export interface GreenfieldStageEvent extends StudioEventBase {
  readonly type: "greenfield.stage";
  readonly stage: string;
  readonly status: RunLogStatus | "info";
  readonly message: string;
  readonly details?: string;
  readonly error?: string;
  readonly provider?: string | null;
  readonly model?: string | null;
}

export interface AiCallEvent extends StudioEventBase {
  readonly type: "ai.call";
  readonly stage: string;
  readonly provider: string;
  readonly model: string;
  readonly estimatedTokens: number;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly error?: string;
}

export interface ProviderFallbackEvent extends StudioEventBase {
  readonly type: "provider.fallback";
  readonly action: "offered" | "selected" | "cancelled" | "escalated";
  readonly fromProvider?: string;
  readonly toProvider?: string;
  readonly reason?: string;
}

export interface FailureReportedEvent extends StudioEventBase {
  readonly type: "failure.reported";
  readonly report: StudioFailureReport;
}

export interface MetadataUpdatedEvent extends StudioEventBase {
  readonly type: "metadata.updated";
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly currentFile?: string | null;
  readonly estimatedAiCalls?: number;
  readonly aiCallsUsed?: number;
}

export type StudioEvent =
  | IntentClassifiedEvent
  | RunBlockedEvent
  | RunLifecycleEvent
  | RunLogBridgeEvent
  | GreenfieldStageEvent
  | AiCallEvent
  | ProviderFallbackEvent
  | FailureReportedEvent
  | MetadataUpdatedEvent;

export type StudioEventListener = (event: StudioEvent) => void;

export const EXECUTION_GRAPH_NODES: readonly { id: GraphNodeId; label: string }[] = [
  { id: "prompt", label: "Prompt" },
  { id: "intent_router", label: "Intent Router" },
  { id: "planner", label: "Planner" },
  { id: "coder", label: "Coder" },
  { id: "patch_apply", label: "Patch Apply" },
  { id: "typescript", label: "TypeScript" },
  { id: "build", label: "Build" },
  { id: "preview", label: "Preview" },
] as const;

export const CONSOLE_CATEGORY_LABELS: Record<ConsoleLogCategory, string> = {
  all: "All",
  ai: "AI",
  files: "Files",
  build: "Build",
  repair: "Repair",
  preview: "Preview",
  errors: "Errors",
  system: "System",
};
