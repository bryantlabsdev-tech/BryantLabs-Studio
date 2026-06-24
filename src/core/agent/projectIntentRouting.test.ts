import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExistingEditableProject,
  scanHasPackageJson,
} from "@/core/agent/projectIntentRouting";
import { mockProjectScan } from "@/core/repository/testScan";

describe("projectIntentRouting", () => {
  it("detects package.json from scan files", () => {
    const scan = mockProjectScan(["package.json", "src/App.tsx"]);
    assert.equal(scanHasPackageJson(scan), true);
    assert.equal(isExistingEditableProject(true, scan), true);
  });

  it("treats empty folder without package.json as not existing", () => {
    const scan = mockProjectScan([], { packageJson: false });
    assert.equal(scanHasPackageJson(scan), false);
    assert.equal(isExistingEditableProject(true, scan), false);
  });

  it("treats package.json-only folder as not existing (greenfield)", () => {
    const scan = mockProjectScan(["package.json"]);
    assert.equal(scanHasPackageJson(scan), true);
    assert.equal(isExistingEditableProject(true, scan), false);
  });
});
