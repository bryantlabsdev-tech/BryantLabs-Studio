import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripMarkerArtifactsFromContent } from "@/core/greenfield/markerContentSanitizer";
import { parseTargetFilesFromResponse } from "@/core/greenfield/parseProjectFile";
import { applyQuickRepairsForFile } from "@/core/greenfield/quickRepair";
import { pickGreenfieldRepairTarget } from "@/core/greenfield/repair";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";

describe("markerContentSanitizer", () => {
  it("strips truncated end markers from parsed page content", () => {
    const raw = `export default Invoices;
@@END:src/pages/`;
    assert.equal(stripMarkerArtifactsFromContent(raw), "export default Invoices;");
  });

  it("parseTargetFilesFromResponse sanitizes recovered blocks", () => {
    const raw = [
      "@@FILE:src/pages/Invoices.tsx@@",
      "export default function Invoices(){ return <div/>; }",
      "@@END:src/pages/",
    ].join("\n");
    const { files } = parseTargetFilesFromResponse(raw, ["src/pages/Invoices.tsx"]);
    assert.equal(files.length, 1);
    assert.doesNotMatch(files[0]!.content, /@@END/);
  });
});

describe("quickRepair marker leakage", () => {
  function diag(line: number): TypeScriptDiagnostic {
    return {
      file: "src/pages/Invoices.tsx",
      line,
      column: 6,
      code: "TS1109",
      message: "Expression expected.",
      category: "error",
      raw: "Expression expected.",
    };
  }

  it("removes leaked marker lines on TS1109", () => {
    const source = "export default Invoices;\n@@END:src/pages/";
    const repaired = applyQuickRepairsForFile(
      "src/pages/Invoices.tsx",
      source,
      [diag(2)],
    );
    assert.ok(repaired);
    assert.equal(repaired!.content.trim(), "export default Invoices;");
  });
});

describe("pickGreenfieldRepairTarget pages", () => {
  it("targets the diagnostic file when error is in src/pages", () => {
    const setup: GreenfieldSetupResult = {
      ok: false,
      install: {
        command: "npm install",
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
        errorCount: 0,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
      typecheck: {
        command: "npx tsc --noEmit",
        ok: false,
        exitCode: 2,
        stdout: "",
        stderr: "",
        durationMs: 1,
        errorCount: 1,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
      typecheckDetails: {
        command: "npx tsc --noEmit",
        exitCode: 2,
        stdout: "",
        stderr: "",
        durationMs: 1,
        timedOut: false,
        truncated: false,
        diagnostics: [
          {
            file: "src/pages/Invoices.tsx",
            line: 89,
            column: 6,
            code: "TS1109",
            message: "Expression expected.",
            category: "error",
            raw: "",
          },
        ],
      },
      error: "TypeScript check failed",
    };
    const target = pickGreenfieldRepairTarget(setup, [
      "src/main.tsx",
      "src/App.tsx",
      "src/pages/Invoices.tsx",
    ]);
    assert.equal(target, "src/pages/Invoices.tsx");
  });
});
