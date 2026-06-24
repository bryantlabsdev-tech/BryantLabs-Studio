/** External MCP tool id helpers (renderer). */
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

export function isExternalToolId(toolId: string): boolean {
  return toolId.startsWith("ext:");
}
