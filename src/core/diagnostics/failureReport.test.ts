import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVerificationFailureReport,
  formatTypeScriptRootCauseLine,
} from "@/core/diagnostics/failureReport";
import type { CommandResult } from "@/types";

function cmd(partial: Partial<CommandResult> & { ok: boolean }): CommandResult {
  return {
    command: partial.command ?? "test",
    ok: partial.ok,
    exitCode: partial.exitCode ?? (partial.ok ? 0 : 1),
    stdout: partial.stdout ?? "",
    stderr: partial.stderr ?? "",
    durationMs: partial.durationMs ?? 10,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
}

describe("buildVerificationFailureReport", () => {
  it("marks TypeScript as root and build as downstream when tsc fails", () => {
    const verification = {
      typecheck: cmd({
        command: "npx tsc --noEmit",
        ok: false,
        stderr:
          "src/App.tsx(42,18): error TS2322: Type 'string' is not assignable to type 'number'.",
      }),
      build: cmd({
        command: "npm run build",
        ok: false,
        stderr: "Build failed due to prior errors",
      }),
      ranAt: Date.now(),
    };

    const report = buildVerificationFailureReport(verification, null);
    assert.match(
      report.rootCauseLine,
      /TypeScript failed in src\/App\.tsx:42:18 — TS2322/,
    );
    assert.equal(report.rootStage, "typescript");

    const ts = report.stages.find((s) => s.stage === "typescript");
    const build = report.stages.find((s) => s.stage === "build");
    assert.equal(ts?.role, "root");
    assert.equal(build?.role, "downstream");
    assert.match(build?.headline ?? "", /downstream/i);
  });

  it("uses build as root when TypeScript passed", () => {
    const verification = {
      typecheck: cmd({ command: "npx tsc --noEmit", ok: true }),
      build: cmd({
        command: "npm run build",
        ok: false,
        stderr: "error during build: module not found",
      }),
      ranAt: Date.now(),
    };

    const report = buildVerificationFailureReport(verification, null);
    assert.equal(report.rootStage, "build");
    assert.match(report.rootCauseLine, /Build failed/);
    const build = report.stages.find((s) => s.stage === "build");
    assert.equal(build?.role, "root");
  });
});

describe("formatTypeScriptRootCauseLine", () => {
  it("formats file line column code message", () => {
    const line = formatTypeScriptRootCauseLine({
      file: "src/App.tsx",
      line: 42,
      column: 18,
      code: "TS2322",
      message: "Type 'string' is not assignable to type 'number'.",
      category: "error",
      raw: "",
    });
    assert.equal(
      line,
      "TypeScript failed in src/App.tsx:42:18 — TS2322 — Type 'string' is not assignable to type 'number'.",
    );
  });
});
