import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeStudioReadinessState } from "./studioTestReadiness";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { EMPTY_PREVIEW } from "@/app/workspace/usePreviewState";

describe("studioTestReadiness", () => {
  it("marks composer blocked while project scan is running", () => {
    const state = computeStudioReadinessState({
      apiReady: true,
      projectPath: "/tmp/app",
      scan: null,
      scanStatus: "scanning",
      greenfieldRun: emptyGreenfieldRun(),
      greenfieldPanelActive: false,
      buildRunning: false,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplySession: null,
      autoFixPhase: null,
      centerTab: "editor",
      appPreview: EMPTY_PREVIEW,
      providerStatus: null,
    });
    assert.equal(state.composerReady, false);
    assert.equal(state.scanStatus, "scanning");
  });

  it("marks preview visible when preview tab is active with url", () => {
    const state = computeStudioReadinessState({
      apiReady: true,
      projectPath: "/tmp/app",
      scan: null,
      scanStatus: "done",
      greenfieldRun: emptyGreenfieldRun(),
      greenfieldPanelActive: false,
      buildRunning: false,
      pipelineRunning: false,
      aiPlanStatus: "idle",
      planApplySession: null,
      autoFixPhase: null,
      centerTab: "preview",
      appPreview: {
        url: "http://127.0.0.1:4173/",
        running: true,
        root: "/tmp/app",
        lastSuccessfulPreviewAt: Date.now(),
        port: 4173,
      },
      providerStatus: null,
    });
    assert.equal(state.previewPanel.visible, true);
    assert.equal(state.previewPanel.port, 4173);
  });
});
