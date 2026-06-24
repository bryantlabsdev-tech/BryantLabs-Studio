import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  readFollowUpReviewFirst,
  writeFollowUpReviewFirst,
} from "./followUpPrefs.ts";

describe("followUpPrefs", () => {
  const key = "bryantlabs.followUpReviewFirst";
  const original = globalThis.localStorage;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    globalThis.localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    } as Storage;
  });

  afterEach(() => {
    globalThis.localStorage = original;
  });

  it("defaults to review-first on", () => {
    assert.equal(readFollowUpReviewFirst(), true);
  });

  it("persists review-first preference", () => {
    writeFollowUpReviewFirst(true);
    assert.equal(store[key], "1");
    assert.equal(readFollowUpReviewFirst(), true);
    writeFollowUpReviewFirst(false);
    assert.equal(readFollowUpReviewFirst(), false);
  });
});
