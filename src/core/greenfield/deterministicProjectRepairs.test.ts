import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES,
} from "@/core/greenfield/projectRepairTypes";
import { GREENFIELD_DETERMINISTIC_REPAIR_MAX_PASSES } from "@/app/orchestration/deterministicProjectRepairOrchestration";

describe("deterministic project repair parity", () => {
  it("uses the same default pass budget in IDE and stress harness", () => {
    assert.equal(
      GREENFIELD_DETERMINISTIC_REPAIR_MAX_PASSES,
      DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES,
    );
    assert.equal(DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES, 24);
  });
});
