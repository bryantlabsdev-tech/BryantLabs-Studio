import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeAppPreviewState } from "./usePreviewState";

describe("mergeAppPreviewState", () => {
  it("returns the previous object when preview fields are unchanged", () => {
    const prev = {
      url: "http://127.0.0.1:4173/",
      running: true,
      root: "/tmp/app",
      lastSuccessfulPreviewAt: 10,
      port: 4173,
    };
    const next = mergeAppPreviewState(prev, {
      url: "http://127.0.0.1:4173/",
      running: true,
      root: "/tmp/app",
      lastSuccessfulPreviewAt: 10,
      port: 4173,
    });
    assert.equal(next, prev);
  });

  it("returns a new object when the preview URL changes", () => {
    const prev = {
      url: "http://127.0.0.1:4173/",
      running: true,
      root: "/tmp/app",
      lastSuccessfulPreviewAt: 10,
      port: 4173,
    };
    const next = mergeAppPreviewState(prev, {
      url: "http://127.0.0.1:4174/",
      running: true,
    });
    assert.notEqual(next, prev);
    assert.equal(next.url, "http://127.0.0.1:4174/");
  });
});
