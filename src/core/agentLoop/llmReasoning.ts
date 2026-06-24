import { extractJsonObject, tryParseJson } from "@/core/providers/jsonRepair";
import { decideNextAction } from "@/core/agentLoop/reasoning";
import type {
  AgentActionParams,
  AgentActionType,
  AgentLoopSession,
  AgentThinkResult,
} from "@/core/agentLoop/types";

const VALID_ACTIONS = new Set<AgentActionType>([
  "search_files",
  "grep_content",
  "read_file",
  "search_symbols",
  "find_references",
  "run_command",
  "invoke_mcp_tool",
  "create_plan",
  "modify_files",
  "run_verification",
  "run_auto_fix",
  "request_user_input",
  "complete_task",
]);

/** Build a compact prompt for provider tool-selection at each agent step. */
export function buildAgentStepPrompt(session: AgentLoopSession): string {
  const f = session.flags;
  const observations =
    session.observations.length > 0
      ? session.observations
          .slice(-12)
          .map((o) => `- ${o}`)
          .join("\n")
      : "- (none)";
  const recentSteps =
    session.reasoningLog.length > 0
      ? session.reasoningLog
          .slice(-5)
          .map((s) => `- ${s.actionDetail}: ${s.result ?? "pending"}`)
          .join("\n")
      : "- (none)";

  return `You are BryantLabs Agent. Choose exactly one next tool to accomplish the goal.

Goal: ${session.goal}
Mode: ${session.mode}
Iteration: ${session.iteration}/${session.maxIterations}

State:
- searchedTerms: ${f.searchedTerms.join(", ") || "(none)"}
- readPaths: ${f.readPaths.join(", ") || "(none)"}
- symbolHits: ${f.symbolHits.length}
- planCreated: ${f.planCreated}
- executionDone: ${f.executionDone}
- lastVerificationOk: ${String(f.lastVerificationOk)}
- autoFixAttempts: ${f.autoFixAttempts}

Observations:
${observations}

Recent actions:
${recentSteps}

Tools (pick one):
- grep_content { "query": string }
- search_files { "query": string }
- search_symbols { "query": string }
- read_file { "path": string }
- find_references { "symbol": string }
- run_command { "command": string }
- invoke_mcp_tool { "tool": string, "argsJson": string }
- create_plan {}
- modify_files {}
- run_verification {}
- run_auto_fix {}
- request_user_input { "message": string }
- complete_task { "message": string }

Respond with ONLY JSON:
{
  "thought": "brief reasoning",
  "reason": "why this tool",
  "action": "tool_name",
  "params": {},
  "actionDetail": "Human label e.g. ReadFile(\\"src/App.tsx\\")"
}`;
}

function normalizeParams(raw: unknown): AgentActionParams {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: {
    query?: string;
    path?: string;
    symbol?: string;
    message?: string;
    command?: string;
    tool?: string;
    argsJson?: string;
  } = {};
  if (typeof obj.query === "string") out.query = obj.query;
  if (typeof obj.path === "string") out.path = obj.path;
  if (typeof obj.symbol === "string") out.symbol = obj.symbol;
  if (typeof obj.message === "string") out.message = obj.message;
  if (typeof obj.command === "string") out.command = obj.command;
  if (typeof obj.tool === "string") out.tool = obj.tool;
  if (typeof obj.argsJson === "string") out.argsJson = obj.argsJson;
  return out;
}

/** Parse provider JSON into the next agent action. Returns null when invalid. */
export function parseAgentStepResponse(text: string): AgentThinkResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const jsonText = extractJsonObject(trimmed);
  if (!jsonText) return null;

  const parsed = tryParseJson(jsonText);
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const action = obj.action;
  if (typeof action !== "string" || !VALID_ACTIONS.has(action as AgentActionType)) {
    return null;
  }

  const thought =
    typeof obj.thought === "string" && obj.thought.trim()
      ? obj.thought.trim()
      : "Next step";
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
  const params = normalizeParams(obj.params);
  const actionDetail =
    typeof obj.actionDetail === "string" && obj.actionDetail.trim()
      ? obj.actionDetail.trim()
      : action;

  return {
    thought,
    reason,
    action: action as AgentActionType,
    params,
    actionDetail,
  };
}

/** Parse native function-call args or JSON text into the next agent action. */
export function parseAgentStepPayload(
  payload: string | Record<string, unknown>,
): AgentThinkResult | null {
  if (typeof payload === "object" && payload !== null) {
    return parseAgentStepResponse(JSON.stringify(payload));
  }
  return parseAgentStepResponse(payload);
}

export interface LlmReasoningInvokeResult {
  ok: boolean;
  text: string;
  nativeArgs?: Record<string, unknown>;
  error?: string;
}

export interface LlmReasoningInvoke {
  (prompt: string): Promise<LlmReasoningInvokeResult>;
}

/**
 * Provider-backed decide function with deterministic fallback when the model
 * fails or returns invalid JSON.
 */
export function createLlmDecideNextAction(
  invoke: LlmReasoningInvoke,
): (session: AgentLoopSession) => Promise<AgentThinkResult> {
  return async (session) => {
    try {
      const res = await invoke(buildAgentStepPrompt(session));
      if (!res.ok) return decideNextAction(session);
      const parsed = res.nativeArgs
        ? parseAgentStepPayload(res.nativeArgs)
        : parseAgentStepPayload(res.text);
      return parsed ?? decideNextAction(session);
    } catch {
      return decideNextAction(session);
    }
  };
}
