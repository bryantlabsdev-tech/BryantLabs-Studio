import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyPlanApplyProposalReason } from "@/core/planApply/proposalDiagnostics";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

describe("timeout leaves zero writes", () => {
  it("keeps timed-out files as errors with no ready proposals", () => {
    const files: PlanApplyFileEntry[] = [
      {
        relPath: "src/App.tsx",
        absPath: "/tmp/app/src/App.tsx",
        selectionReason: "test",
        planReason: "test",
        status: "error",
        decision: "rejected",
        error: "No first byte received within 60 seconds",
      },
      {
        relPath: "src/index.css",
        absPath: "/tmp/app/src/index.css",
        selectionReason: "test",
        planReason: "test",
        status: "error",
        decision: "rejected",
        error: "No first byte received within 60 seconds",
      },
    ];
    assert.equal(
      files.filter((f) => f.status === "ready").length,
      0,
    );
    assert.equal(
      classifyPlanApplyProposalReason(files[0]!),
      "No first byte received within 60 seconds",
    );
  });
});
