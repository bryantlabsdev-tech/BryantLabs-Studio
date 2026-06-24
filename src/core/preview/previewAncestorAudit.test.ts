import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditPreviewAncestors } from "@/core/preview/previewAncestorAudit";

describe("auditPreviewAncestors", () => {
  it("reports missing frame when element is null", () => {
    const audit = auditPreviewAncestors(null);
    assert.equal(audit.rows.length, 0);
    assert.match(audit.collapseReason, /not mounted/i);
  });
});
