import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTypeScriptDiagnostics,
  formatTypeScriptDiagnosticsCopy,
  buildTypeScriptCheckDetails,
} from "./tscDiagnostics.cjs";
import type { CommandResult } from "./setup.cjs";

describe("parseTypeScriptDiagnostics", () => {
  it("parses parenthesis format", () => {
    const out = `src/App.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.`;
    const d = parseTypeScriptDiagnostics(out, "");
    assert.equal(d.length, 1);
    assert.deepEqual(d[0], {
      file: "src/App.tsx",
      line: 12,
      column: 5,
      code: "TS2322",
      category: "error",
      message: "Type 'string' is not assignable to type 'number'.",
      raw: out,
    });
  });

  it("parses colon-dash format", () => {
    const err = `src/main.tsx:3:1 - error TS2307: Cannot find module './missing'.`;
    const d = parseTypeScriptDiagnostics("", err);
    assert.equal(d[0]?.file, "src/main.tsx");
    assert.equal(d[0]?.line, 3);
    assert.equal(d[0]?.code, "TS2307");
  });
});

describe("formatTypeScriptDiagnosticsCopy", () => {
  it("includes command and streams", () => {
    const cmd: CommandResult = {
      command: "npx tsc --noEmit",
      ok: false,
      exitCode: 2,
      stdout: "src/App.tsx(1,1): error TS1005: test.",
      stderr: "",
      durationMs: 100,
      errorCount: 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    };
    const details = buildTypeScriptCheckDetails(cmd);
    const text = formatTypeScriptDiagnosticsCopy(details);
    assert.match(text, /Command: npx tsc --noEmit/);
    assert.match(text, /Exit code: 2/);
    assert.match(text, /src\/App\.tsx:1:1 error TS1005: test\./);
  });
});
