import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditPreviewLayout } from "@/core/preview/previewLayoutAudit";

describe("auditPreviewLayout", () => {
  it("reports disabled viewport controls and empty measurements when DOM is absent", () => {
    const audit = auditPreviewLayout({
      previewRoot: null,
      toolbar: null,
      frameWrap: null,
      frame: null,
      viewportControlsEnabled: false,
    });
    assert.equal(audit.viewportControlsEnabled, false);
    assert.equal(audit.zoomMode, "none");
    assert.equal(audit.deviceMode, "simple (controls off)");
    assert.equal(audit.availablePreviewHeight, 0);
  });
});
