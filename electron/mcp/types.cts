/** MCP tool types (electron copy — keep aligned with src/core/mcp/types.ts). */
export interface McpToolInputProperty {
  readonly type: "string" | "number" | "boolean" | "array";
  readonly description?: string;
}

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Readonly<Record<string, McpToolInputProperty>>;
    readonly required?: readonly string[];
  };
}
