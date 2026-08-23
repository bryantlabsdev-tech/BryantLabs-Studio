import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditPreviewAncestors, previewAncestorAuditsEqual } from "@/core/preview/previewAncestorAudit";

describe("auditPreviewAncestors", () => {
  it("reports missing frame when element is null", () => {
    const audit = auditPreviewAncestors(null);
    assert.equal(audit.rows.length, 0);
    assert.match(audit.collapseReason, /not mounted/i);
  });

  it("treats sub-pixel height churn as the same audit", () => {
    const a = auditPreviewAncestors(null);
    const b = {
      ...a,
      rows: [
        {
          depth: 0,
          selector: "webview",
          tag: "webview",
          clientHeight: 400.4,
          scrollHeight: 400,
          offsetHeight: 400.2,
          computedHeight: "400.4px",
          computedMinHeight: "0px",
          computedMaxHeight: "none",
          overflow: "visible / visible",
          display: "flex",
          flex: "1 1 auto",
          position: "relative",
        },
      ],
    };
    const c = {
      ...b,
      rows: [
        {
          ...b.rows[0]!,
          clientHeight: 400.2,
          offsetHeight: 400.4,
          computedHeight: "400.2px",
        },
      ],
    };
    assert.equal(previewAncestorAuditsEqual(b, c), true);
  });
});
