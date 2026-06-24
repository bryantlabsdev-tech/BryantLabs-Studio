import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectGeminiEmptyResponse,
  GEMINI_EMPTY_RESPONSE_ERROR,
} from "./geminiEmptyResponse.cjs";

describe("detectGeminiEmptyResponse", () => {
  it("flags HTTP-200 responses with candidates=[]", () => {
    const message = detectGeminiEmptyResponse({ candidates: [] }, "");
    assert.ok(message);
    assert.match(message!, /candidates=\[\]/);
    assert.match(message!, /Retry with a different model/);
  });

  it("returns null when model text is present", () => {
    assert.equal(
      detectGeminiEmptyResponse(
        { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }] },
        "{}",
      ),
      null,
    );
  });

  it("flags MAX_TOKENS candidate with no text parts", () => {
    const message = detectGeminiEmptyResponse(
      {
        candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }],
        usageMetadata: { thoughtsTokenCount: 900 },
      },
      "",
    );
    assert.ok(message);
    assert.match(message!, /MAX_TOKENS/);
    assert.match(message!, /Thinking consumed 900/);
  });

  it("does not flag safety-blocked responses here", () => {
    assert.equal(
      detectGeminiEmptyResponse(
        { promptFeedback: { blockReason: "SAFETY" }, candidates: [] },
        "",
      ),
      null,
    );
  });

  it("uses the dedicated empty-response headline", () => {
    const message = detectGeminiEmptyResponse({ candidates: [] }, "");
    assert.ok(message?.startsWith(GEMINI_EMPTY_RESPONSE_ERROR));
  });
});
