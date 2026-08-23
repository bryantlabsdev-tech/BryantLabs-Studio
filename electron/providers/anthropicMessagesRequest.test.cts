import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANTHROPIC_MESSAGES_SERIALIZER,
  buildAnthropicMessagesRequest,
  describeAnthropicRequestStructure,
  diffAnthropicRequestStructures,
  validateAnthropicMessagesSchema,
} from "./anthropicMessagesRequest.cjs";

describe("anthropicMessagesRequest", () => {
  it("serializes once with official text content blocks", () => {
    const built = buildAnthropicMessagesRequest({
      model: "claude-opus-4-6",
      prompt: 'Hello "world"\nline2',
      maxTokens: 256,
    });
    assert.equal(built.serializer, ANTHROPIC_MESSAGES_SERIALIZER);
    assert.equal(built.localJsonParse, "pass");
    assert.equal(built.schemaResult, "ok");
    assert.equal(built.hashBeforeValidation, built.hashBeforeSend);
    assert.equal(built.byteLength, built.bodyBuffer.length);
    assert.deepEqual(built.structure.topLevelKeys, [
      "max_tokens",
      "messages",
      "model",
    ]);
    assert.deepEqual(built.structure.contentBlockTypes, [["text"]]);
    assert.equal(built.structure.messageCount, 1);
    assert.equal(built.structure.toolCount, 0);
    const parsed = JSON.parse(built.serialized) as {
      messages: Array<{ content: unknown }>;
    };
    assert.ok(Array.isArray(parsed.messages[0]!.content));
  });

  it("rejects control characters via sanitize then still parses", () => {
    const built = buildAnthropicMessagesRequest({
      model: "claude-opus-4-6",
      prompt: "ok\u0000bad\u0001",
      maxTokens: 128,
    });
    assert.equal(built.localJsonParse, "pass");
    assert.equal(built.schemaResult, "ok");
    assert.ok(!built.serialized.includes("\u0000"));
  });

  it("validates schema error codes without retaining bodies", () => {
    assert.equal(validateAnthropicMessagesSchema(null), "not_object");
    assert.equal(
      validateAnthropicMessagesSchema({ model: "x", max_tokens: 1, messages: [] }),
      "empty_messages",
    );
    assert.equal(
      validateAnthropicMessagesSchema({
        model: "x",
        max_tokens: 1.5,
        messages: [{ role: "user", content: "hi" }],
      }),
      "invalid_max_tokens",
    );
  });

  it("diffs structures without prompt text", () => {
    const a = describeAnthropicRequestStructure({
      model: "m",
      max_tokens: 1,
      messages: [{ role: "user", content: [{ type: "text", text: "secret" }] }],
    });
    const b = describeAnthropicRequestStructure({
      model: "m",
      max_tokens: 1,
      messages: [{ role: "user", content: "secret" }],
      tools: [{}],
    });
    const diff = diffAnthropicRequestStructures(a, b);
    assert.equal(diff.contentShapeChanged, true);
    assert.equal(diff.toolCountDelta, -1);
    assert.ok(diff.keysOnlyInSucceeded.includes("tools"));
    assert.ok(!JSON.stringify(diff).includes("secret"));
  });

  it("does not double-encode the body string", () => {
    const built = buildAnthropicMessagesRequest({
      model: "claude-opus-4-6",
      prompt: "ping",
      maxTokens: 64,
    });
    const once = JSON.parse(built.serialized);
    assert.equal(typeof once, "object");
    assert.notEqual(typeof once, "string");
  });
});
