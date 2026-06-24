import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpToolRegistry } from "@/core/mcp/toolRegistry";

describe("McpToolRegistry", () => {
  it("lists and invokes registered tools", async () => {
    const registry = new McpToolRegistry();
    registry.register(
      {
        name: "echo",
        description: "Echo text",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      async (args) => ({
        ok: true,
        content: String(args.text ?? ""),
      }),
    );

    const tools = registry.listTools();
    assert.equal(tools.length, 1);
    const result = await registry.invoke({ tool: "echo", args: { text: "hi" } });
    assert.equal(result.ok, true);
    assert.equal(result.content, "hi");
  });

  it("rejects missing required args", async () => {
    const registry = new McpToolRegistry();
    registry.register(
      {
        name: "need_path",
        description: "Needs path",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      async () => ({ ok: true, content: "ok" }),
    );
    const result = await registry.invoke({ tool: "need_path", args: {} });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Missing required/);
  });
});
