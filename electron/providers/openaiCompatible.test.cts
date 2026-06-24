import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractOpenAiApiError,
  extractOpenAiChatText,
  parseOpenAiModelIds,
} from "./openaiCompatible.cjs";

describe("openaiCompatible", () => {
  it("parseOpenAiModelIds extracts model ids", () => {
    const ids = parseOpenAiModelIds({
      data: [{ id: "llama-3.3-70b-versatile" }, { id: "openai/gpt-4.1-mini" }],
    });
    assert.deepEqual(ids, ["llama-3.3-70b-versatile", "openai/gpt-4.1-mini"]);
  });

  it("extractOpenAiChatText reads assistant message", () => {
    const text = extractOpenAiChatText({
      choices: [{ message: { content: "Hello from Groq" } }],
    });
    assert.equal(text, "Hello from Groq");
  });

  it("extractOpenAiApiError reads nested error message", () => {
    assert.equal(
      extractOpenAiApiError({ error: { message: "Invalid API key" } }),
      "Invalid API key",
    );
  });
});
