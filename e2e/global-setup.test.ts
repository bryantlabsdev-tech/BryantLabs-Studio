import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertPlaywrightDistBuildReady,
  missingPlaywrightDistOutputs,
} from "./global-setup.ts";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "bryantlabs-global-setup-"));
}

describe("playwright dist global setup", () => {
  it("reports missing dist and dist-electron outputs", () => {
    const root = makeRoot();
    try {
      assert.deepEqual(missingPlaywrightDistOutputs(root), [
        "dist/index.html",
        "dist-electron/main.cjs",
      ]);
      assert.throws(
        () => assertPlaywrightDistBuildReady(root),
        /PLAYWRIGHT_USE_DIST=1 requires prebuilt outputs[\s\S]*dist\/index.html[\s\S]*dist-electron\/main\.cjs/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts an existing Vite dist and Electron main bundle", () => {
    const root = makeRoot();
    try {
      mkdirSync(join(root, "dist"), { recursive: true });
      mkdirSync(join(root, "dist-electron"), { recursive: true });
      writeFileSync(join(root, "dist/index.html"), "<html></html>");
      writeFileSync(join(root, "dist-electron/main.cjs"), "module.exports = {};");
      assert.deepEqual(missingPlaywrightDistOutputs(root), []);
      assert.doesNotThrow(() => assertPlaywrightDistBuildReady(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
