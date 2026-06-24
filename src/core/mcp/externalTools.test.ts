import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  externalToolId,
  isExternalToolId,
  parseExternalToolId,
} from "@/core/mcp/externalTools";

describe("externalToolId", () => {
  it("builds and parses ext server tool ids", () => {
    const id = externalToolId("filesystem", "read_file");
    assert.equal(id, "ext:filesystem/read_file");
    assert.equal(isExternalToolId(id), true);
    assert.deepEqual(parseExternalToolId(id), {
      serverId: "filesystem",
      toolName: "read_file",
    });
  });

  it("rejects builtin tool names", () => {
    assert.equal(parseExternalToolId("read_file"), null);
    assert.equal(isExternalToolId("semantic_search"), false);
  });
});
