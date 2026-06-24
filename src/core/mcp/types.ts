/** JSON-schema-lite descriptor for MCP-style tool inputs. */
export interface McpToolInputProperty {
  readonly type: "string" | "number" | "boolean" | "array";
  readonly description?: string;
  readonly items?: { readonly type: "string" };
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

export interface McpToolInvocation {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface McpToolResult {
  readonly ok: boolean;
  readonly content: string;
  readonly structured?: unknown;
  readonly error?: string;
}

export interface McpHostStatus {
  readonly ready: boolean;
  readonly projectOpen: boolean;
  readonly builtinToolCount: number;
  readonly externalServerCount: number;
  readonly lastError: string | null;
}
