import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldMountPreviewFrame } from "./previewMount.ts";

describe("shouldMountPreviewFrame", () => {
  it("mounts while probing a live Studio preview process", () => {
    assert.equal(
      shouldMountPreviewFrame({
        frameSrc: "http://127.0.0.1:4173/",
        frameState: "loading",
        httpReady: false,
        probing: true,
        studioProcessRunning: true,
        probeFailed: false,
      }),
      true,
    );
  });

  it("does not mount when the probe proved the server is down", () => {
    assert.equal(
      shouldMountPreviewFrame({
        frameSrc: "http://127.0.0.1:4173/",
        frameState: "loading",
        httpReady: false,
        probing: false,
        studioProcessRunning: false,
        probeFailed: true,
      }),
      false,
    );
  });
});
