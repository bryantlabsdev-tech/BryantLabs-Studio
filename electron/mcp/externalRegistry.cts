import type { McpToolDefinition, McpToolInputProperty } from "./types.cjs";
import { McpStdioClient } from "./stdioClient.cjs";
import {
  externalToolId,
  loadMcpServerConfigs,
  parseExternalToolId,
  type McpServerConfig,
} from "./serverConfig.cjs";
import type { McpToolResult } from "./builtinTools.cjs";

interface ExternalServerState {
  readonly config: McpServerConfig;
  client: McpStdioClient | null;
  tools: McpToolDefinition[];
  lastError: string | null;
}

function toolContentText(
  content: Array<{ type?: string; text?: string }> | undefined,
): string {
  if (!content?.length) return "";
  return content
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("\n");
}

/** Lazy-connecting registry for configured external MCP stdio servers. */
export class ExternalMcpRegistry {
  private servers = new Map<string, ExternalServerState>();
  private loadedForRoot: string | null | undefined;
  private lastError: string | null = null;

  async refresh(projectRoot: string | null): Promise<void> {
    if (this.loadedForRoot === projectRoot) return;
    this.dispose();
    this.loadedForRoot = projectRoot;
    const configs = await loadMcpServerConfigs(projectRoot);
    for (const [id, config] of Object.entries(configs)) {
      this.servers.set(id, {
        config,
        client: null,
        tools: [],
        lastError: null,
      });
    }
  }

  getServerCount(): number {
    return this.servers.size;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private async ensureClient(serverId: string): Promise<ExternalServerState | null> {
    const state = this.servers.get(serverId);
    if (!state) return null;
    if (state.client) return state;
    try {
      const client = new McpStdioClient({
        command: state.config.command,
        args: state.config.args,
        env: state.config.env,
      });
      const tools = await client.listTools();
      state.client = client;
      state.tools = tools.map((tool) => ({
        name: externalToolId(serverId, tool.name),
        description: tool.description ?? `External MCP tool ${tool.name}`,
        inputSchema: normalizeInputSchema(tool.inputSchema),
      }));
      state.lastError = null;
      return state;
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err);
      this.lastError = state.lastError;
      return state;
    }
  }

  async listToolDefinitions(): Promise<McpToolDefinition[]> {
    const out: McpToolDefinition[] = [];
    for (const serverId of this.servers.keys()) {
      const state = await this.ensureClient(serverId);
      if (state?.tools.length) out.push(...state.tools);
    }
    return out;
  }

  async invokeTool(
    toolId: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<McpToolResult> {
    const parsed = parseExternalToolId(toolId);
    if (!parsed) {
      return { ok: false, content: "", error: "Invalid external tool id." };
    }
    const state = await this.ensureClient(parsed.serverId);
    if (!state?.client) {
      return {
        ok: false,
        content: "",
        error: state?.lastError ?? `MCP server "${parsed.serverId}" unavailable.`,
      };
    }
    try {
      const result = await state.client.callTool(parsed.toolName, {
        ...args,
      });
      const content = toolContentText(result.content);
      return {
        ok: content.length > 0,
        content: content || "External tool returned no text.",
        structured: result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastError = message;
      return { ok: false, content: "", error: message };
    }
  }

  dispose(): void {
    for (const state of this.servers.values()) {
      state.client?.close();
    }
    this.servers.clear();
    this.loadedForRoot = undefined;
  }
}

function normalizeInputSchema(
  schema: unknown,
): McpToolDefinition["inputSchema"] {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const obj = schema as {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
  const properties: Record<string, McpToolInputProperty> = {};
  for (const [key, value] of Object.entries(obj.properties ?? {})) {
    const t = value.type;
    if (t === "string" || t === "number" || t === "boolean" || t === "array") {
      properties[key] = {
        type: t,
        ...(value.description ? { description: value.description } : {}),
      };
    }
  }
  return {
    type: "object",
    properties,
    ...(obj.required ? { required: obj.required } : {}),
  };
}

export const externalMcpRegistry = new ExternalMcpRegistry();
