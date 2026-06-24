import { app } from "electron";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface McpServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled?: boolean;
}

export interface McpServersFile {
  readonly mcpServers?: Record<string, McpServerConfig>;
}

function parseServersFile(raw: unknown): Record<string, McpServerConfig> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const servers = obj.mcpServers;
  if (servers && typeof servers === "object") {
    return servers as Record<string, McpServerConfig>;
  }
  return {};
}

async function readServersFile(filePath: string): Promise<Record<string, McpServerConfig>> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return parseServersFile(JSON.parse(text));
  } catch {
    return {};
  }
}

/** Merge userData + project MCP server configs (project wins on name collision). */
export async function loadMcpServerConfigs(
  projectRoot: string | null,
): Promise<Record<string, McpServerConfig>> {
  const userPath = path.join(app.getPath("userData"), "mcp-servers.json");
  const merged = await readServersFile(userPath);

  if (projectRoot) {
    const projectPath = path.join(projectRoot, ".bryantlabs", "mcp.json");
    const projectServers = await readServersFile(projectPath);
    Object.assign(merged, projectServers);
  }

  const enabled: Record<string, McpServerConfig> = {};
  for (const [id, cfg] of Object.entries(merged)) {
    if (!cfg?.command?.trim()) continue;
    if (cfg.enabled === false) continue;
    enabled[id] = cfg;
  }
  return enabled;
}

export function externalToolId(serverId: string, toolName: string): string {
  return `ext:${serverId}/${toolName}`;
}

export function parseExternalToolId(
  toolId: string,
): { serverId: string; toolName: string } | null {
  if (!toolId.startsWith("ext:")) return null;
  const rest = toolId.slice(4);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return {
    serverId: rest.slice(0, slash),
    toolName: rest.slice(slash + 1),
  };
}
