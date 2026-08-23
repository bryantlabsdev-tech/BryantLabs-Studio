import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  jsonRequestBody,
  sanitizeProviderPrompt,
} from "./sanitizePrompt.cjs";

describe("sanitizeProviderPrompt", () => {
  it("strips null bytes and lone surrogates", () => {
    const raw = "hello\u0000world\ud800tail";
    const safe = sanitizeProviderPrompt(raw);
    assert.equal(safe.includes("\u0000"), false);
    assert.ok(safe.includes("hello"));
    assert.ok(safe.includes("world"));
    assert.ok(safe.includes("\uFFFD"));
  });

  it("produces valid JSON bodies", () => {
    const body = jsonRequestBody({
      model: "claude",
      messages: [{ role: "user", content: sanitizeProviderPrompt("line\u0000break") }],
    });
    assert.equal(typeof body, "string");
    assert.doesNotThrow(() => JSON.parse(body));
  });

  it("round-trips large patch prompts", () => {
    const content = "export default function App() {\n".padEnd(3200, " ");
    const body = jsonRequestBody({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      messages: [{ role: "user", content: sanitizeProviderPrompt(content) }],
    });
    const parsed = JSON.parse(body) as {
      messages?: Array<{ content?: string }>;
    };
    assert.equal(parsed.messages?.[0]?.content?.length, content.length);
  });
});
