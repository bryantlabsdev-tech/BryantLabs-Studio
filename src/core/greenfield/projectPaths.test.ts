import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedGreenfieldProjectPath,
  assertAllowedProjectPaths,
} from "@/core/greenfield/projectPaths";

describe("greenfield project path allowlist", () => {
  it("allows nested source files and public assets", () => {
    assert.equal(isAllowedGreenfieldProjectPath("src/components/jobs/JobCard.tsx"), true);
    assert.equal(isAllowedGreenfieldProjectPath("src/data/seed.ts"), true);
    assert.equal(isAllowedGreenfieldProjectPath("public/logo.svg"), true);
    assert.equal(isAllowedGreenfieldProjectPath("public/favicon.svg"), true);
  });

  it("rejects traversal and non-public binaries", () => {
    assert.equal(isAllowedGreenfieldProjectPath("public/../secret.svg"), false);
    assert.equal(isAllowedGreenfieldProjectPath("../evil.ts"), false);
    assert.equal(isAllowedGreenfieldProjectPath("public/logo.exe"), false);
    assert.deepEqual(assertAllowedProjectPaths(["public/../x.svg", "src/App.tsx"]), [
      "public/../x.svg",
    ]);
  });
});
