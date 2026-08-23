import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAgentFilePreview } from "@/core/agent/formatAgentFilePreview";

describe("formatAgentFilePreview", () => {
  it("returns small files unchanged", () => {
    assert.equal(formatAgentFilePreview("hello"), "hello");
  });

  it("samples head and tail for large files", () => {
    const content = "x".repeat(20_000);
    const preview = formatAgentFilePreview(content, 1000);
    assert.ok(preview.length < content.length);
    assert.ok(preview.includes("truncated"));
    assert.ok(preview.startsWith("x"));
    assert.ok(preview.endsWith("x"));
  });
});
