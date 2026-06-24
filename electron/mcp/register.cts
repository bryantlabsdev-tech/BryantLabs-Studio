import {
  BUILTIN_TOOL_DEFINITIONS,
  invokeBuiltinTool,
} from "./builtinTools.cjs";
import { externalMcpRegistry } from "./externalRegistry.cjs";
import type { McpRegisterDeps } from "./context.cjs";

export function registerMcpIpc({ ipcMain, ctx }: McpRegisterDeps): void {
  const refreshExternal = async () => {
    await externalMcpRegistry.refresh(ctx.getProjectRoot());
  };

  ipcMain.handle("mcp:status", async () => {
    await refreshExternal();
    const root = ctx.getProjectRoot();
    return {
      ready: true,
      projectOpen: root !== null,
      builtinToolCount: BUILTIN_TOOL_DEFINITIONS.length,
      externalServerCount: externalMcpRegistry.getServerCount(),
      lastError: externalMcpRegistry.getLastError(),
    };
  });

  ipcMain.handle("mcp:listTools", async () => {
    await refreshExternal();
    const external = await externalMcpRegistry.listToolDefinitions();
    return [...BUILTIN_TOOL_DEFINITIONS, ...external];
  });

  ipcMain.handle(
    "mcp:invokeTool",
    async (_event, tool: unknown, args: unknown) => {
      if (typeof tool !== "string" || tool.length === 0) {
        return { ok: false, content: "", error: "Invalid tool name." };
      }
      const record =
        typeof args === "object" && args !== null
          ? (args as Record<string, unknown>)
          : {};

      if (tool.startsWith("ext:")) {
        await refreshExternal();
        return externalMcpRegistry.invokeTool(tool, record);
      }

      return invokeBuiltinTool(ctx, tool, record);
    },
  );
}
