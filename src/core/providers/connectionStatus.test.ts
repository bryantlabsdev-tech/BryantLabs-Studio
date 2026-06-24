import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyHttpConnectionStatus,
  parseAnthropicModelIds,
} from "@/core/providers/connectionStatus";

describe("Anthropic connection helpers", () => {
  it("parses model ids from API list response", () => {
    const ids = parseAnthropicModelIds({
      data: [
        { id: "claude-opus-4-8", type: "model" },
        { id: "claude-sonnet-4-6", type: "model" },
        { id: "claude-haiku-4-5", type: "model" },
      ],
    });
    assert.deepEqual(ids, [
      "claude-haiku-4-5",
      "claude-opus-4-8",
      "claude-sonnet-4-6",
    ]);
  });

  it("classifies HTTP status for provider UI", () => {
    assert.equal(classifyHttpConnectionStatus(401, null), "invalid_key");
    assert.equal(classifyHttpConnectionStatus(429, null), "rate_limited");
    assert.equal(
      classifyHttpConnectionStatus(null, new Error("fetch failed")),
      "offline",
    );
  });
});
