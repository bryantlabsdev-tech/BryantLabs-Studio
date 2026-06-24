import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import {
  emptyGraphNodes,
  graphNodeForStage,
  graphStateFromStatus,
  nextConsoleEntryId,
  parseFileLocation,
  runLogToConsoleEntry,
  updateGraphNode,
} from "@/core/console/runLogBridge";
import { studioEventBus } from "@/core/console/studioEventBus";
import type {
  ConsoleFailureDiagnostic,
  ConsoleLogEntry,
  ConsoleRunMetadata,
  ExecutionGraphNode,
  GraphNodeId,
  GraphNodeState,
  PersistedConsoleRun,
  StudioEvent,
} from "@/core/console/types";

const STORAGE_KEY = "bryantlabs.developerConsole.v1";
const MAX_RUNS_PER_PROJECT = 50;
const ENABLED_KEY = "bryantlabs.developerConsoleEnabled";

interface StoredConsoleData {
  readonly version: 1;
  readonly runs: PersistedConsoleRun[];
}

export type ExecutionLogListener = (state: ExecutionLogState) => void;

export interface ExecutionLogState {
  readonly enabled: boolean;
  readonly projectPath: string | null;
  readonly activeRunId: string | null;
  readonly selectedRunId: string | null;
  readonly entries: readonly ConsoleLogEntry[];
  readonly metadata: ConsoleRunMetadata;
  readonly graph: readonly ExecutionGraphNode[];
  readonly failureDiagnostic: ConsoleFailureDiagnostic | null;
  readonly runHistory: readonly PersistedConsoleRun[];
}

function readStorage(): StoredConsoleData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, runs: [] };
    const data = JSON.parse(raw) as StoredConsoleData;
    if (data.version !== 1 || !Array.isArray(data.runs)) {
      return { version: 1, runs: [] };
    }
    return data;
  } catch {
    return { version: 1, runs: [] };
  }
}

function writeStorage(runs: PersistedConsoleRun[]): void {
  const payload: StoredConsoleData = { version: 1, runs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function readDeveloperConsoleEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDeveloperConsoleEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

function emptyMetadata(runId: string | null): ConsoleRunMetadata {
  return {
    runId: runId ?? "",
    provider: null,
    model: null,
    elapsedMs: 0,
    currentStage: null,
    currentFile: null,
    estimatedAiCalls: 0,
    aiCallsUsed: 0,
    startedAt: null,
    status: "idle",
  };
}

function failureFromReport(report: StudioFailureReport): ConsoleFailureDiagnostic {
  const loc = parseFileLocation(report.rootCauseLine);
  const rootStage = report.stages.find((s) => s.role === "root");
  const tsDiag = rootStage?.typecheckDetails?.diagnostics?.[0];
  const filePath = tsDiag?.file ?? loc?.filePath ?? null;
  const lineNumber = tsDiag?.line ?? loc?.lineNumber ?? null;
  const errorCode = tsDiag?.code ? `TS${tsDiag.code}` : null;

  const retryActions: string[] = [];
  if (report.rootStage === "typescript" || report.rootStage === "build") {
    retryActions.push("Retry verification");
    retryActions.push("Run auto-repair");
  }
  if (report.rootStage === "patch_propose" || report.rootStage === "write") {
    retryActions.push("Retry with stronger model");
    retryActions.push("Review patch proposals");
  }
  retryActions.push("Open failure diagnostics");

  const rawError =
    rootStage?.detail ??
    rootStage?.headline ??
    report.rootCauseLine;

  return {
    rootCause: report.rootCauseLine,
    rawError,
    filePath,
    lineNumber,
    errorCode,
    retryActions,
  };
}

function createRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ExecutionLogService {
  private listeners = new Set<ExecutionLogListener>();
  private unsubscribeBus: (() => void) | null = null;
  private projectPath: string | null = null;
  private enabled = readDeveloperConsoleEnabled();
  private activeRunId: string | null = null;
  private selectedRunId: string | null = null;
  private entries: ConsoleLogEntry[] = [];
  private metadata = emptyMetadata(null);
  private graph: ExecutionGraphNode[] = emptyGraphNodes();
  private failureDiagnostic: ConsoleFailureDiagnostic | null = null;
  private runHistory: PersistedConsoleRun[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.runHistory = readStorage().runs;
  }

  start(): void {
    if (this.unsubscribeBus) return;
    this.unsubscribeBus = studioEventBus.subscribe((event) => this.handleEvent(event));
    this.tickTimer = setInterval(() => this.emitState(), 1000);
  }

  stop(): void {
    this.unsubscribeBus?.();
    this.unsubscribeBus = null;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  subscribe(listener: ExecutionLogListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): ExecutionLogState {
    return {
      enabled: this.enabled,
      projectPath: this.projectPath,
      activeRunId: this.activeRunId,
      selectedRunId: this.selectedRunId,
      entries: this.entries,
      metadata: this.computeMetadata(),
      graph: this.graph,
      failureDiagnostic: this.failureDiagnostic,
      runHistory: this.filteredHistory(),
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    writeDeveloperConsoleEnabled(enabled);
    this.emitState();
  }

  setProjectPath(path: string | null): void {
    this.projectPath = path;
    if (!this.selectedRunId || !this.activeRunId) {
      this.entries = [];
      this.graph = emptyGraphNodes();
      this.failureDiagnostic = null;
      this.metadata = emptyMetadata(null);
    }
    this.emitState();
  }

  selectRun(runId: string | null): void {
    if (!runId) {
      this.selectedRunId = this.activeRunId;
      this.emitState();
      return;
    }
    const run = this.runHistory.find((r) => r.id === runId);
    if (!run) return;
    this.selectedRunId = runId;
    if (runId === this.activeRunId) {
      this.emitState();
      return;
    }
    this.entries = [...run.entries];
    this.graph = [...run.graph];
    this.metadata = { ...run.metadata };
    this.failureDiagnostic = run.failureDiagnostic;
    this.emitState();
  }

  viewCurrentRun(): void {
    this.selectedRunId = this.activeRunId;
    const active = this.runHistory.find((r) => r.id === this.activeRunId);
    if (active) {
      this.entries = [...active.entries];
      this.graph = [...active.graph];
      this.metadata = { ...active.metadata };
      this.failureDiagnostic = active.failureDiagnostic;
    }
    this.emitState();
  }

  private filteredHistory(): PersistedConsoleRun[] {
    if (!this.projectPath) return this.runHistory.slice(0, MAX_RUNS_PER_PROJECT);
    return this.runHistory
      .filter((r) => r.projectPath === this.projectPath)
      .slice(0, MAX_RUNS_PER_PROJECT);
  }

  private computeMetadata(): ConsoleRunMetadata {
    const startedAt = this.metadata.startedAt;
    const elapsedMs =
      startedAt != null
        ? Date.now() - startedAt
        : 0;
    return {
      ...this.metadata,
      runId: this.activeRunId ?? this.metadata.runId,
      elapsedMs:
        this.metadata.status === "running" && startedAt != null
          ? elapsedMs
          : this.metadata.elapsedMs,
    };
  }

  private emitState(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private beginRun(actionType?: string): void {
    this.persistActiveRun();
    const runId = createRunId();
    this.activeRunId = runId;
    this.selectedRunId = runId;
    this.entries = [];
    this.graph = emptyGraphNodes();
    this.failureDiagnostic = null;
    const now = Date.now();
    this.metadata = {
      runId,
      provider: null,
      model: null,
      elapsedMs: 0,
      currentStage: actionType ?? "starting",
      currentFile: null,
      estimatedAiCalls: 0,
      aiCallsUsed: 0,
      startedAt: now,
      status: "running",
    };
    this.appendEntry({
      id: nextConsoleEntryId(),
      timestamp: new Date(now).toISOString(),
      title: "Run Started",
      category: "system",
      status: "running",
      fields: actionType ? { action: actionType } : {},
      runId,
    });
    this.graph = updateGraphNode(this.graph, "prompt", "running", now);
    this.emitState();
  }

  private endRun(ok: boolean, message?: string): void {
    if (!this.activeRunId) return;
    const now = Date.now();
    const status = ok ? "success" : "failed";
    this.metadata = {
      ...this.metadata,
      status: ok ? "success" : "failed",
      currentStage: ok ? "completed" : "failed",
      elapsedMs:
        this.metadata.startedAt != null ? now - this.metadata.startedAt : 0,
    };
    this.appendEntry({
      id: nextConsoleEntryId(),
      timestamp: new Date(now).toISOString(),
      title: ok ? "Run Completed" : "Run Failed",
      category: ok ? "system" : "errors",
      status,
      fields: message ? { message } : {},
      runId: this.activeRunId,
    });
    this.persistActiveRun();
    this.activeRunId = null;
    this.emitState();
  }

  private cancelRun(message?: string): void {
    if (!this.activeRunId) return;
    const now = Date.now();
    this.metadata = {
      ...this.metadata,
      status: "cancelled",
      currentStage: "cancelled",
      elapsedMs:
        this.metadata.startedAt != null ? now - this.metadata.startedAt : 0,
    };
    this.appendEntry({
      id: nextConsoleEntryId(),
      timestamp: new Date(now).toISOString(),
      title: "Run Cancelled",
      category: "system",
      status: "failed",
      fields: message ? { reason: message } : {},
      runId: this.activeRunId,
    });
    this.persistActiveRun();
    this.activeRunId = null;
    this.emitState();
  }

  private appendEntry(entry: ConsoleLogEntry): void {
    this.entries = [...this.entries, entry];
    this.syncActiveRunSnapshot();
  }

  private syncActiveRunSnapshot(): void {
    if (!this.activeRunId || !this.projectPath) return;
    const snapshot: PersistedConsoleRun = {
      id: this.activeRunId,
      projectPath: this.projectPath,
      startedAt: new Date(this.metadata.startedAt ?? Date.now()).toISOString(),
      endedAt:
        this.metadata.status !== "running"
          ? new Date().toISOString()
          : null,
      status:
        this.metadata.status === "idle"
          ? "running"
          : this.metadata.status,
      provider: this.metadata.provider,
      model: this.metadata.model,
      entries: this.entries,
      metadata: this.computeMetadata(),
      failureDiagnostic: this.failureDiagnostic,
      graph: this.graph,
    };
    const without = this.runHistory.filter((r) => r.id !== this.activeRunId);
    this.runHistory = [snapshot, ...without].slice(0, MAX_RUNS_PER_PROJECT * 4);
    writeStorage(this.runHistory);
  }

  private persistActiveRun(): void {
    if (!this.activeRunId) return;
    this.syncActiveRunSnapshot();
  }

  private setGraphNode(nodeId: GraphNodeId, state: GraphNodeState): void {
    this.graph = updateGraphNode(this.graph, nodeId, state, Date.now());
  }

  private shouldEndRunFromLog(
    stage: import("@/core/greenfield/runLog").RunLogStage,
    status: import("@/core/greenfield/runLog").RunLogStatus,
    message: string,
  ): boolean {
    if (status === "failed" && stage === "error") return true;
    if (status !== "success") return false;
    if (stage === "pipeline_complete") return true;
    if (stage === "preview") return true;
    if (stage === "apply_plan" && /completed/i.test(message)) return true;
    if (stage === "studio_agent" && /completed/i.test(message)) return true;
    if (stage === "pipeline" && /complete/i.test(message)) return true;
    return false;
  }

  private handleEvent(event: StudioEvent): void {
    if (event.projectPath && this.projectPath && event.projectPath !== this.projectPath) {
      return;
    }

    switch (event.type) {
      case "intent.classified": {
        if (!this.activeRunId) this.beginRun("agent");
        const now = Date.now();
        this.appendEntry({
          id: nextConsoleEntryId(),
          timestamp: new Date(now).toISOString(),
          title: "Intent Router",
          category: "system",
          status: "success",
          fields: { intent: event.intent, ...(event.reason ? { reason: event.reason } : {}) },
          runId: this.activeRunId!,
        });
        this.setGraphNode("intent_router", "success");
        this.metadata = {
          ...this.metadata,
          currentStage: `intent:${event.intent}`,
        };
        break;
      }
      case "run.blocked": {
        this.appendEntry({
          id: nextConsoleEntryId(),
          timestamp: new Date(event.timestamp).toISOString(),
          title: "Mutex Blocked",
          category: "system",
          status: "failed",
          fields: { reason: event.reason },
          runId: this.activeRunId ?? "blocked",
        });
        break;
      }
      case "run.started":
        if (!this.activeRunId) this.beginRun(event.actionType);
        break;
      case "run.completed":
        if (this.activeRunId) this.endRun(event.ok !== false, event.message);
        break;
      case "run.cancelled":
        if (this.activeRunId) this.cancelRun(event.message);
        break;
      case "run.log": {
        if (!this.activeRunId) this.beginRun();
        const runId = this.activeRunId as string;
        const entry = runLogToConsoleEntry({
          runId,
          timestamp: new Date(event.timestamp).toISOString(),
          stage: event.stage,
          status: event.status,
          message: event.message,
          ...(event.details ? { details: event.details } : {}),
          ...(event.provider != null ? { provider: event.provider } : {}),
          ...(event.model != null ? { model: event.model } : {}),
        });
        this.appendEntry(entry);

        if (event.provider) {
          this.metadata = { ...this.metadata, provider: event.provider };
        }
        if (event.model) {
          this.metadata = { ...this.metadata, model: event.model };
        }
        if (entry.fields.file) {
          this.metadata = { ...this.metadata, currentFile: entry.fields.file };
        }
        if (event.stage === "ai_call" && event.status === "success") {
          this.metadata = {
            ...this.metadata,
            aiCallsUsed: this.metadata.aiCallsUsed + 1,
          };
        }
        if (entry.fields.estimated_tokens) {
          const est = Number.parseInt(entry.fields.estimated_tokens, 10);
          if (!Number.isNaN(est)) {
            this.metadata = {
              ...this.metadata,
              estimatedAiCalls: Math.max(this.metadata.estimatedAiCalls, est),
            };
          }
        }
        this.metadata = {
          ...this.metadata,
          currentStage: entry.title,
        };

        const nodeId = graphNodeForStage(event.stage);
        if (nodeId) {
          this.setGraphNode(nodeId, graphStateFromStatus(event.status));
        }

        if (/cancel/i.test(event.message)) {
          this.cancelRun(event.message);
        } else if (this.shouldEndRunFromLog(event.stage, event.status, event.message)) {
          this.endRun(event.status === "success", event.message);
        }
        break;
      }
      case "greenfield.stage": {
        if (!this.activeRunId) this.beginRun("greenfield");
        const runId = this.activeRunId as string;
        const status =
          event.status === "info"
            ? "success"
            : event.status === "running"
              ? "running"
              : event.status === "failed"
                ? "failed"
                : "success";
        const rawError =
          status === "failed"
            ? (event.error ?? event.details)
            : undefined;
        this.appendEntry({
          id: nextConsoleEntryId(),
          timestamp: new Date(event.timestamp).toISOString(),
          title: event.message || event.stage,
          category: event.stage.includes("preview")
            ? "preview"
            : event.stage.includes("typescript") ||
                event.stage.includes("build") ||
                event.stage.includes("npm")
              ? "build"
              : event.stage.includes("write")
                ? "files"
                : "ai",
          status,
          fields: {
            stage: event.stage,
            ...(event.provider ? { provider: event.provider } : {}),
            ...(event.model ? { model: event.model } : {}),
          },
          ...(event.details ? { details: event.details } : {}),
          ...(rawError ? { rawError } : {}),
          runId,
        });
        this.metadata = {
          ...this.metadata,
          currentStage: event.stage,
          ...(event.provider ? { provider: event.provider } : {}),
          ...(event.model ? { model: event.model } : {}),
        };
        break;
      }
      case "ai.call": {
        if (!this.activeRunId) this.beginRun();
        const runId = this.activeRunId as string;
        const title = event.ok ? "AI Call Completed" : "AI Call Failed";
        this.appendEntry({
          id: nextConsoleEntryId(),
          timestamp: new Date(event.timestamp).toISOString(),
          title,
          category: "ai",
          status: event.ok ? "success" : "failed",
          fields: {
            stage: event.stage,
            provider: event.provider,
            model: event.model,
            estimated_tokens: String(event.estimatedTokens),
            duration_ms: String(event.durationMs),
          },
          ...(event.error ? { rawError: event.error } : {}),
          runId,
        });
        this.metadata = {
          ...this.metadata,
          provider: event.provider,
          model: event.model,
          aiCallsUsed: this.metadata.aiCallsUsed + 1,
          estimatedAiCalls: Math.max(
            this.metadata.estimatedAiCalls,
            this.metadata.aiCallsUsed + 1,
          ),
        };
        break;
      }
      case "provider.fallback": {
        if (!this.activeRunId) this.beginRun();
        const runId = this.activeRunId as string;
        this.appendEntry({
          id: nextConsoleEntryId(),
          timestamp: new Date(event.timestamp).toISOString(),
          title: "Provider Fallback",
          category: "ai",
          status: event.action === "cancelled" ? "failed" : "running",
          fields: {
            action: event.action,
            ...(event.fromProvider ? { from: event.fromProvider } : {}),
            ...(event.toProvider ? { to: event.toProvider } : {}),
            ...(event.reason ? { reason: event.reason } : {}),
          },
          runId,
        });
        break;
      }
      case "failure.reported": {
        this.failureDiagnostic = failureFromReport(event.report);
        if (!this.activeRunId) this.beginRun();
        const runId = this.activeRunId as string;
        this.appendEntry({
          id: nextConsoleEntryId(),
          timestamp: new Date(event.timestamp).toISOString(),
          title: "Failure Diagnostic",
          category: "errors",
          status: "failed",
          fields: {
            root_cause: event.report.rootCauseLine,
            ...(this.failureDiagnostic.errorCode
              ? { code: this.failureDiagnostic.errorCode }
              : {}),
          },
          rawError: this.failureDiagnostic.rawError,
          ...(this.failureDiagnostic.filePath
            ? { filePath: this.failureDiagnostic.filePath }
            : {}),
          ...(this.failureDiagnostic.lineNumber != null
            ? { lineNumber: this.failureDiagnostic.lineNumber }
            : {}),
          runId,
        });
        this.metadata = { ...this.metadata, status: "failed", currentStage: "failed" };
        break;
      }
      case "metadata.updated": {
        this.metadata = {
          ...this.metadata,
          ...(event.provider !== undefined ? { provider: event.provider } : {}),
          ...(event.model !== undefined ? { model: event.model } : {}),
          ...(event.currentFile !== undefined
            ? { currentFile: event.currentFile }
            : {}),
          ...(event.estimatedAiCalls !== undefined
            ? { estimatedAiCalls: event.estimatedAiCalls }
            : {}),
          ...(event.aiCallsUsed !== undefined
            ? { aiCallsUsed: event.aiCallsUsed }
            : {}),
        };
        break;
      }
      default:
        break;
    }

    this.emitState();
  }
}

export const executionLogService = new ExecutionLogService();
