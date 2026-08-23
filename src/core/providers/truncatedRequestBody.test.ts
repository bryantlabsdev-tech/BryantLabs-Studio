import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTruncatedRequestBodyError,
  shouldRetryApplyPlanWithCompression,
} from "@/core/providers/reliability";

describe("truncated request body errors", () => {
  it("detects Anthropic malformed JSON body errors", () => {
    const msg =
      "The request body is not valid JSON: unexpected end of data: line 1 column 12369 (char 12368)";
    assert.equal(isTruncatedRequestBodyError(msg), true);
    assert.equal(shouldRetryApplyPlanWithCompression(msg), true);
  });

  it("detects Anthropic endof-data variant", () => {
    const msg =
      "The request body is not valid JSON: unexpected endof data: line 1 column 6883 (char 6882)";
    assert.equal(isTruncatedRequestBodyError(msg), true);
  });
});
