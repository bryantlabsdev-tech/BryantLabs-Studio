import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPreviewDiagnostics } from "./previewDiagnostics.cjs";

const baseContext = {
  hasPreviewScript: true,
  previewScript: "vite preview",
  distExists: true,
  distPath: "/tmp/proj/dist",
  packageJsonExists: true,
};

describe("buildPreviewDiagnostics vite config", () => {
  it("uses precise root cause instead of wrapper", () => {
    const d = buildPreviewDiagnostics({
      root: "/tmp/proj",
      port: 4173,
      exitCode: 1,
      stdout: "",
      stderr: [
        "failed to load config from /tmp/proj/vite.config.ts",
        "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'framer-motion'",
      ].join("\n"),
      portInUse: false,
      portHeldByStudio: true,
      triedPorts: [4173],
      context: baseContext,
    });

    assert.ok(d.viteConfig);
    assert.match(d.rootCause, /framer-motion/);
    assert.ok(!/^failed to load config from/i.test(d.rootCause));
    assert.equal(d.firstErrorLine, d.viteConfig?.firstException);
  });
});
