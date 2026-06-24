import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPreviewProjectContext,
  findFirstErrorLine,
  inferPreviewRootCause,
  previewCommand,
} from "./previewDiagnostics.cjs";

describe("inferPreviewRootCause", () => {
  const baseContext = {
    hasPreviewScript: true,
    previewScript: "vite preview",
    distExists: true,
    distPath: "/tmp/dist",
    packageJsonExists: true,
  };

  it("detects missing dist", () => {
    const cause = inferPreviewRootCause({
      stdout: "",
      stderr: "",
      exitCode: 1,
      port: 4173,
      portInUse: false,
      allPortsInUse: false,
      context: { ...baseContext, distExists: false },
    });
    assert.match(cause, /dist folder missing/i);
  });

  it("detects port in use from stderr", () => {
    const cause = inferPreviewRootCause({
      stdout: "",
      stderr: "Error: listen EADDRINUSE: address already in use 127.0.0.1:4173",
      exitCode: 1,
      port: 4173,
      portInUse: true,
      allPortsInUse: false,
      context: baseContext,
    });
    assert.match(cause, /Port 4173 already in use/i);
  });

  it("detects missing preview script", () => {
    const cause = inferPreviewRootCause({
      stdout: "",
      stderr: "",
      exitCode: 1,
      port: 4173,
      portInUse: false,
      allPortsInUse: false,
      context: { ...baseContext, hasPreviewScript: false, previewScript: null },
    });
    assert.match(cause, /no preview script/i);
  });
});

describe("findFirstErrorLine", () => {
  it("returns first error line from vite output", () => {
    const line = findFirstErrorLine(
      "",
      "error when starting preview server:\nError: listen EADDRINUSE: address already in use :::4173",
    );
    assert.ok(line?.includes("EADDRINUSE"));
  });
});

describe("previewCommand", () => {
  it("includes host and port", () => {
    assert.equal(
      previewCommand(4174),
      "npm run preview -- --host 127.0.0.1 --port 4174",
    );
  });
});

describe("collectPreviewProjectContext", () => {
  it("reads preview script from package.json in repo", () => {
    const ctx = collectPreviewProjectContext(process.cwd());
    assert.equal(ctx.packageJsonExists, true);
    assert.ok(typeof ctx.hasPreviewScript === "boolean");
  });
});
