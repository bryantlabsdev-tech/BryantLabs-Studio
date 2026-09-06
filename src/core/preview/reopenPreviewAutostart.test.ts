import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  previewAutostartLatchAfterProjectChange,
  shouldAutostartPreviewOnReopen,
  shouldRetryPreviewHttpProbe,
  type ReopenPreviewAutostartInput,
} from "@/core/preview/reopenPreviewAutostart";

const ready = (
  overrides: Partial<ReopenPreviewAutostartInput> = {},
): ReopenPreviewAutostartInput => ({
  projectPath: "/tmp/app",
  scanStatus: "done",
  indexedSourceFileCount: 3,
  previewRunning: false,
  startedForProjectPath: null,
  genStatus: "idle",
  setupStatus: "idle",
  buildRunning: false,
  pipelineRunning: false,
  ...overrides,
});

describe("shouldAutostartPreviewOnReopen", () => {
  it("starts once after a done scan with indexed sources", () => {
    assert.equal(shouldAutostartPreviewOnReopen(ready()), true);
  });

  it("does not start for an empty folder", () => {
    assert.equal(
      shouldAutostartPreviewOnReopen(ready({ indexedSourceFileCount: 0 })),
      false,
    );
  });

  it("does not start while scanning or generating", () => {
    assert.equal(
      shouldAutostartPreviewOnReopen(ready({ scanStatus: "scanning" })),
      false,
    );
    assert.equal(
      shouldAutostartPreviewOnReopen(ready({ genStatus: "running" })),
      false,
    );
  });

  it("does not start a second time for the same project path", () => {
    assert.equal(
      shouldAutostartPreviewOnReopen(
        ready({ startedForProjectPath: "/tmp/app" }),
      ),
      false,
    );
  });

  it("does not start when preview is already running or setup is blocked", () => {
    assert.equal(
      shouldAutostartPreviewOnReopen(ready({ previewRunning: true })),
      false,
    );
    assert.equal(
      shouldAutostartPreviewOnReopen(ready({ setupStatus: "repair_needed" })),
      false,
    );
  });

  it("retries HTTP probe until the preview server answers", () => {
    assert.equal(
      shouldRetryPreviewHttpProbe({
        running: true,
        url: "http://127.0.0.1:4173/",
        probeOk: false,
      }),
      true,
    );
    assert.equal(
      shouldRetryPreviewHttpProbe({
        running: true,
        url: "http://127.0.0.1:4173/",
        probeOk: true,
      }),
      false,
    );
  });

  it("resets the latch when the open project changes", () => {
    assert.equal(
      previewAutostartLatchAfterProjectChange("/tmp/a", "/tmp/b", "/tmp/a"),
      null,
    );
    assert.equal(
      previewAutostartLatchAfterProjectChange("/tmp/a", "/tmp/a", "/tmp/a"),
      "/tmp/a",
    );
  });

  it("does not exceed a one-shot decision across remount ticks", () => {
    const REACT_MAX_UPDATE_DEPTH = 50;
    let startedForProjectPath: string | null = null;
    let starts = 0;
    for (let i = 0; i < REACT_MAX_UPDATE_DEPTH + 5; i += 1) {
      if (
        shouldAutostartPreviewOnReopen(
          ready({ startedForProjectPath }),
        )
      ) {
        startedForProjectPath = "/tmp/app";
        starts += 1;
      }
    }
    assert.equal(starts, 1);
  });
});
