import type { BryantLabsApi } from "@/types";
import type { McpHostStatus, McpToolDefinition, McpToolResult } from "@/core/mcp/types";

export const EXPECTED_BUILTIN_MCP_TOOLS = [
  "read_file",
  "list_directory",
  "scan_project",
  "git_status",
  "verify_project",
  "semantic_search",
] as const;

export type BuiltinMcpToolName = (typeof EXPECTED_BUILTIN_MCP_TOOLS)[number];

export async function getMcpHostStatus(
  api: BryantLabsApi | undefined,
): Promise<McpHostStatus | null> {
  if (!api?.getMcpStatus) return null;
  try {
    return await api.getMcpStatus();
  } catch {
    return null;
  }
}

export async function listMcpTools(
  api: BryantLabsApi | undefined,
): Promise<readonly McpToolDefinition[]> {
  if (!api?.listMcpTools) return [];
  try {
    return await api.listMcpTools();
  } catch {
    return [];
  }
}

export async function invokeMcpTool(
  api: BryantLabsApi | undefined,
  tool: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  if (!api?.invokeMcpTool) {
    return { ok: false, content: "", error: "MCP API unavailable." };
  }
  try {
    return await api.invokeMcpTool(tool, args);
  } catch (err) {
    return {
      ok: false,
      content: "",
      error: err instanceof Error ? err.message : "MCP invoke failed.",
    };
  }
}

export async function mcpSemanticSearch(
  api: BryantLabsApi | undefined,
  query: string,
  limit = 12,
): Promise<McpToolResult> {
  return invokeMcpTool(api, "semantic_search", { query, limit });
}
