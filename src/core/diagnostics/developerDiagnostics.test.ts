import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEVELOPER_DIAGNOSTICS_EVENT,
  readDeveloperDiagnosticsEnabled,
} from "@/core/diagnostics/developerDiagnostics";

describe("developerDiagnostics", () => {
  it("exports diagnostics event name for UI sync", () => {
    assert.equal(DEVELOPER_DIAGNOSTICS_EVENT, "bryantlabs:developer-diagnostics");
  });

  it("readDeveloperDiagnosticsEnabled returns a boolean", () => {
    assert.equal(typeof readDeveloperDiagnosticsEnabled(), "boolean");
  });
});
