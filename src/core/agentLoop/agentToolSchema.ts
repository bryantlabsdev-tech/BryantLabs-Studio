import type { AgentActionType } from "@/core/agentLoop/types";

export const AGENT_STEP_FUNCTION_NAME = "agent_step";

export const AGENT_ACTION_ENUM: readonly AgentActionType[] = [
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
];

/** Gemini / OpenAI-compatible function declaration for native tool-calling. */
export const AGENT_STEP_FUNCTION_DECLARATION = {
  name: AGENT_STEP_FUNCTION_NAME,
  description:
    "Choose the next BryantLabs agent action to progress toward the user's goal.",
  parameters: {
    type: "object",
    properties: {
      thought: { type: "string", description: "Brief reasoning for this step" },
      reason: { type: "string", description: "Why this tool is appropriate" },
      action: {
        type: "string",
        enum: [...AGENT_ACTION_ENUM],
        description: "Tool to invoke",
      },
      params: {
        type: "object",
        properties: {
          query: { type: "string" },
          path: { type: "string" },
          symbol: { type: "string" },
          message: { type: "string" },
          command: { type: "string" },
          tool: { type: "string" },
          argsJson: { type: "string" },
        },
      },
      actionDetail: {
        type: "string",
        description: 'Human-readable label, e.g. ReadFile("src/App.tsx")',
      },
    },
    required: ["thought", "reason", "action", "actionDetail"],
  },
} as const;
