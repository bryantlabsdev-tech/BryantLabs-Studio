#!/usr/bin/env node
/**
 * Minimal MCP echo server for BryantLabs external MCP bridge tests.
 * Implements initialize, tools/list, and tools/call over stdio JSON-RPC.
 */
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = msg;
  let result = null;

  if (method === "initialize") {
    result = {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "bryantlabs-echo", version: "1.0.0" },
    };
  } else if (method === "tools/list") {
    result = {
      tools: [
        {
          name: "echo",
          description: "Echo input text back",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        },
      ],
    };
  } else if (method === "tools/call") {
    const text = String(params?.arguments?.text ?? "");
    result = { content: [{ type: "text", text }] };
  }

  if (id != null) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }
});
