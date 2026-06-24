import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatOllamaModelOptionLabel,
  parseOllamaTagNames,
  resolveOllamaModelAfterDiscovery,
} from "@/core/providers/ollamaModels";

describe("ollamaModels", () => {
  it("parses exact tag names from /api/tags", () => {
    const names = parseOllamaTagNames({
      models: [
        { name: "qwen2.5:7b" },
        { name: "qwen2.5-coder:7b" },
        { name: "llama3.2:3b" },
        { name: "qwen2.5-coder:3b" },
      ],
    });
    assert.deepEqual(names, [
      "llama3.2:3b",
      "qwen2.5-coder:3b",
      "qwen2.5-coder:7b",
      "qwen2.5:7b",
    ]);
  });

  it("keeps saved model when installed", () => {
    const installed = ["qwen2.5-coder:7b", "llama3.2:3b"];
    assert.equal(
      resolveOllamaModelAfterDiscovery("qwen2.5-coder:7b", installed),
      "qwen2.5-coder:7b",
    );
  });

  it("maps legacy base name to full tag", () => {
    const installed = ["llama3.2:3b", "qwen2.5:7b"];
    assert.equal(
      resolveOllamaModelAfterDiscovery("llama3.2", installed),
      "llama3.2:3b",
    );
  });

  it("falls back to first installed model", () => {
    assert.equal(
      resolveOllamaModelAfterDiscovery("missing", ["qwen2.5:7b", "llama3.2:3b"]),
      "qwen2.5:7b",
    );
  });

  it("marks recommended coding model in label", () => {
    assert.equal(
      formatOllamaModelOptionLabel("qwen2.5-coder:7b"),
      "⭐ qwen2.5-coder:7b",
    );
    assert.equal(formatOllamaModelOptionLabel("llama3.2:3b"), "llama3.2:3b");
  });
});
