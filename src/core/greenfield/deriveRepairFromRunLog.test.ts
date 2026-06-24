import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveRepairFromRunLog } from "@/core/greenfield/runLog";

describe("deriveRepairFromRunLog", () => {
  it("derives repair attempts from greenfield_repair log entries", () => {
    const repair = deriveRepairFromRunLog([
      {
        id: "repair-1",
        stage: "greenfield_repair",
        status: "success",
        message: "Repair attempt 1 applied",
        details: "src/App.tsx",
        timestamp: new Date().toISOString(),
      },
    ]);

    assert.ok(repair);
    assert.equal(repair?.filesRepaired.length, 1);
    assert.match(repair?.attempts[0] ?? "", /Repair attempt 1 applied/);
  });
});
