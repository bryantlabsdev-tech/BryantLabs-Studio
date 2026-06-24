import type {
  McpToolDefinition,
  McpToolInvocation,
  McpToolResult,
} from "@/core/mcp/types";

export type McpToolHandler = (
  args: Readonly<Record<string, unknown>>,
) => Promise<McpToolResult>;

export class McpToolRegistry {
  private readonly tools = new Map<
    string,
    { def: McpToolDefinition; handler: McpToolHandler }
  >();

  register(def: McpToolDefinition, handler: McpToolHandler): void {
    if (this.tools.has(def.name)) {
      throw new Error(`MCP tool already registered: ${def.name}`);
    }
    this.tools.set(def.name, { def, handler });
  }

  listTools(): readonly McpToolDefinition[] {
    return [...this.tools.values()].map((t) => t.def);
  }

  async invoke(invocation: McpToolInvocation): Promise<McpToolResult> {
    const entry = this.tools.get(invocation.tool);
    if (!entry) {
      return {
        ok: false,
        content: "",
        error: `Unknown tool: ${invocation.tool}`,
      };
    }
    const missing = (entry.def.inputSchema.required ?? []).filter(
      (key) => invocation.args[key] === undefined || invocation.args[key] === "",
    );
    if (missing.length > 0) {
      return {
        ok: false,
        content: "",
        error: `Missing required arguments: ${missing.join(", ")}`,
      };
    }
    try {
      return await entry.handler(invocation.args);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool invocation failed.";
      return { ok: false, content: "", error: message };
    }
  }
}
