import type { RunLogStage, RunLogStatus } from "@/core/greenfield/runLog";
import type {
  ConsoleLogCategory,
  ConsoleLogEntry,
  GraphNodeId,
  GraphNodeState,
} from "@/core/console/types";

let entrySeq = 0;

export function nextConsoleEntryId(): string {
  entrySeq += 1;
  return `console-${entrySeq}`;
}

export function formatConsoleTime(isoOrMs: string | number): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function categoryForStage(stage: RunLogStage): Exclude<ConsoleLogCategory, "all"> {
  switch (stage) {
    case "ai_plan":
    case "ai_call":
    case "provider":
    case "provider_call":
    case "provider_health":
    case "provider_fallback":
    case "provider_response":
    case "prompt":
    case "generation":
    case "parser":
    case "pipeline_planner":
    case "pipeline_coder":
      return "ai";
    case "write":
    case "approve":
    case "apply_plan":
    case "ai_patch_propose":
    case "ai_patch_apply":
    case "safe_edit":
    case "multi_file_execution":
      return "files";
    case "npm_install":
    case "typescript":
    case "build":
    case "verification":
      return "build";
    case "auto_fix":
    case "greenfield_repair":
    case "pipeline_repair":
      return "repair";
    case "preview":
      return "preview";
    case "error":
      return "errors";
    default:
      return "system";
  }
}

export function titleForRunLog(
  stage: RunLogStage,
  status: RunLogStatus,
  message: string,
): string {
  const lower = message.toLowerCase();

  if (stage === "pipeline_planner" || stage === "ai_plan") {
    if (status === "running") return "Planner Started";
    if (status === "success") return "Planner Completed";
    if (status === "failed") return "Planner Failed";
  }
  if (stage === "pipeline_coder" || lower.includes("coder")) {
    if (status === "running") return "Coder Started";
    if (status === "success") return "Coder Completed";
    if (status === "failed") return "Coder Failed";
  }
  if (stage === "apply_plan") {
    if (status === "running" && /propos/i.test(message)) return "Coder Started";
    if (status === "running") return "Apply Plan Started";
    if (status === "success" && /patch/i.test(message)) return "Patch Accepted";
    if (status === "failed" && /reject/i.test(message)) return "Patch Rejected";
    if (status === "success") return "Apply Plan Completed";
  }
  if (stage === "pipeline_repair" || stage === "auto_fix" || stage === "greenfield_repair") {
    if (status === "running") return "Repair Started";
    if (status === "success") return "Repair Completed";
    if (status === "failed") return "Repair Failed";
  }
  if (stage === "write") {
    if (/edit/i.test(message)) return message.startsWith("Editing") ? message : `Editing ${message}`;
    if (/^(Wrote|Overwrote|Failed)\s+/i.test(message)) return message;
    return status === "success" ? "File Written" : "File Write Failed";
  }
  if (stage === "npm_install") {
    if (status === "running") return "npm install Started";
    return status === "success" ? "npm install Completed" : "npm install Failed";
  }
  if (stage === "typescript") {
    if (status === "running") return "TypeScript Started";
    if (status === "success") return "TypeScript Passed";
    return "TypeScript Failed";
  }
  if (stage === "build") {
    if (status === "running") return "Build Started";
    if (status === "success") return "Build Passed";
    return "Build Failed";
  }
  if (stage === "preview") {
    if (status === "success") return "Preview Updated";
    if (status === "running") return "Preview Starting";
    return "Preview Failed";
  }
  if (stage === "verification") {
    if (status === "running") return "Verification Started";
    return status === "success" ? "Verification Passed" : "Verification Failed";
  }
  if (stage === "ai_call") {
    if (status === "running") return "AI Call Started";
    return status === "success" ? "AI Call Completed" : "AI Call Failed";
  }
  if (stage === "provider_fallback") return "Provider Fallback";
  if (stage === "pipeline" && /cancel/i.test(message)) return "Run Cancelled";
  if (stage === "error") return "Error";

  return message.length > 64 ? `${message.slice(0, 61)}…` : message;
}

export function extractFieldsFromMessage(
  stage: RunLogStage,
  message: string,
  details?: string,
  provider?: string | null,
  model?: string | null,
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (provider) fields.provider = provider;
  if (model) fields.model = model;

  const providerModel = message.match(/^([a-z_]+)\s*\/\s*(.+)$/i);
  if (providerModel && !fields.provider) {
    fields.provider = providerModel[1] ?? "";
    fields.model = providerModel[2] ?? "";
  }

  const stageDot = message.match(/^([a-z_]+)\s*·\s*([a-z_]+)\s*·\s*(.+)$/i);
  if (stageDot) {
    fields.stage = stageDot[1] ?? "";
    fields.provider = stageDot[2] ?? fields.provider ?? "";
    fields.model = stageDot[3] ?? fields.model ?? "";
  }

  if (stage === "write" || /edit/i.test(message)) {
    const fileMatch = message.match(/(?:Editing|edit|write|modified)\s+(.+)/i);
    if (fileMatch?.[1]) fields.file = fileMatch[1].trim();
  }

  if (details) {
    const tokenMatch = details.match(/estimated[:\s]+(\d+)/i);
    if (tokenMatch?.[1]) fields.estimated_tokens = tokenMatch[1];
    const durationMatch = details.match(/(\d+)\s*ms/i);
    if (durationMatch?.[1]) fields.duration_ms = durationMatch[1];
  }

  return fields;
}

export function parseFileLocation(
  text: string,
): { filePath: string; lineNumber: number | null } | null {
  const match = text.match(/([^\s:]+\.[a-z]+):(\d+)/i);
  if (!match?.[1]) return null;
  return {
    filePath: match[1],
    lineNumber: match[2] ? Number.parseInt(match[2], 10) : null,
  };
}

export function runLogToConsoleEntry(opts: {
  runId: string;
  timestamp: string;
  stage: RunLogStage;
  status: RunLogStatus;
  message: string;
  details?: string;
  provider?: string | null;
  model?: string | null;
}): ConsoleLogEntry {
  const title = titleForRunLog(opts.stage, opts.status, opts.message);
  const fields = extractFieldsFromMessage(
    opts.stage,
    opts.message,
    opts.details,
    opts.provider,
    opts.model,
  );
  const loc = parseFileLocation(opts.details ?? opts.message);

  return {
    id: nextConsoleEntryId(),
    timestamp: opts.timestamp,
    title,
    category: categoryForStage(opts.stage),
    status: opts.status,
    fields,
    ...(opts.details ? { details: opts.details } : {}),
    ...(opts.status === "failed" ? { rawError: opts.details ?? opts.message } : {}),
    ...(loc?.filePath ? { filePath: loc.filePath } : {}),
    ...(loc?.lineNumber != null ? { lineNumber: loc.lineNumber } : {}),
    runId: opts.runId,
  };
}

export function graphNodeForStage(stage: RunLogStage): GraphNodeId | null {
  switch (stage) {
    case "prompt":
      return "prompt";
    case "ai_plan":
    case "pipeline_planner":
      return "planner";
    case "pipeline_coder":
    case "apply_plan":
    case "ai_patch_propose":
      return "coder";
    case "write":
    case "approve":
    case "ai_patch_apply":
      return "patch_apply";
    case "typescript":
      return "typescript";
    case "build":
      return "build";
    case "preview":
      return "preview";
    default:
      return null;
  }
}

export function graphStateFromStatus(status: RunLogStatus | "info"): GraphNodeState {
  if (status === "running" || status === "pending") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "waiting";
}

export function emptyGraphNodes(): import("@/core/console/types").ExecutionGraphNode[] {
  return [
    { id: "prompt", label: "Prompt", state: "waiting", startedAt: null, endedAt: null },
    { id: "intent_router", label: "Intent Router", state: "waiting", startedAt: null, endedAt: null },
    { id: "planner", label: "Planner", state: "waiting", startedAt: null, endedAt: null },
    { id: "coder", label: "Coder", state: "waiting", startedAt: null, endedAt: null },
    { id: "patch_apply", label: "Patch Apply", state: "waiting", startedAt: null, endedAt: null },
    { id: "typescript", label: "TypeScript", state: "waiting", startedAt: null, endedAt: null },
    { id: "build", label: "Build", state: "waiting", startedAt: null, endedAt: null },
    { id: "preview", label: "Preview", state: "waiting", startedAt: null, endedAt: null },
  ];
}

export function updateGraphNode(
  nodes: import("@/core/console/types").ExecutionGraphNode[],
  nodeId: GraphNodeId,
  state: GraphNodeState,
  at: number,
): import("@/core/console/types").ExecutionGraphNode[] {
  return nodes.map((n) => {
    if (n.id !== nodeId) return n;
    return {
      ...n,
      state,
      startedAt: n.startedAt ?? (state === "running" ? at : null),
      endedAt:
        state === "success" || state === "failed" ? at : n.endedAt,
    };
  });
}
