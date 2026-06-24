import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePreviewCanvasMetrics,
  loadPreviewViewportPrefs,
  PREVIEW_VIEWPORT_DEFAULTS,
  savePreviewViewportPrefs,
} from "@/core/preview/viewport";

describe("computePreviewCanvasMetrics", () => {
  it("desktop uses full available dimensions and actual-size keeps zoom only", () => {
    const m = computePreviewCanvasMetrics({
      viewportWidth: 900,
      viewportHeight: 500,
      deviceId: "desktop",
      zoom: 1,
      fitMode: "actual-size",
      contentScrollHeight: 1200,
    });
    assert.equal(m.availableWidthPx, 900);
    assert.equal(m.availableHeightPx, 500);
    assert.equal(m.deviceMaxWidthPx, null);
    assert.equal(m.contentScale, 1);
  });

  it("actual-size at 75% zoom does not shrink available height", () => {
    const m = computePreviewCanvasMetrics({
      viewportWidth: 900,
      viewportHeight: 500,
      deviceId: "desktop",
      zoom: 0.75,
      fitMode: "actual-size",
      contentScrollHeight: 2000,
    });
    assert.equal(m.availableHeightPx, 500);
    assert.equal(m.contentScale, 0.75);
  });

  it("mobile preset caps width but fills panel height", () => {
    const m = computePreviewCanvasMetrics({
      viewportWidth: 900,
      viewportHeight: 500,
      deviceId: "mobile",
      zoom: 1,
      fitMode: "actual-size",
      contentScrollHeight: 800,
    });
    assert.equal(m.deviceMaxWidthPx, 390);
    assert.equal(m.availableHeightPx, 500);
  });

  it("fit-width scales from full panel width", () => {
    const m = computePreviewCanvasMetrics({
      viewportWidth: 900,
      viewportHeight: 500,
      deviceId: "mobile",
      zoom: 1,
      fitMode: "fit-width",
      contentScrollHeight: 800,
    });
    assert.ok(m.contentScale > 1);
  });

  it("fit-height scales from panel height and guest scroll height", () => {
    const m = computePreviewCanvasMetrics({
      viewportWidth: 900,
      viewportHeight: 500,
      deviceId: "desktop",
      zoom: 1,
      fitMode: "fit-height",
      contentScrollHeight: 1000,
    });
    assert.equal(m.contentScale, 0.5);
    assert.equal(m.availableHeightPx, 500);
  });
});

describe("preview viewport prefs", () => {
  it("round-trips defaults through localStorage", () => {
    savePreviewViewportPrefs(PREVIEW_VIEWPORT_DEFAULTS);
    const loaded = loadPreviewViewportPrefs();
    assert.equal(loaded.deviceId, "desktop");
    assert.equal(loaded.zoom, 1);
    assert.equal(loaded.fitMode, "actual-size");
  });
});
