import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGreenfieldRepairContent } from "./repairParse.cjs";
import { buildGreenfieldRepairProviderPrompt } from "./repair.cjs";

const SAMPLE = `import { useState } from "react";
export default function App() { return null; }
`;

describe("parseGreenfieldRepairContent (electron)", () => {
  it("parses single @@FILE block without requiring all seven greenfield files", () => {
    const raw = `@@FILE:src/App.tsx@@
${SAMPLE}
@@END@@`;
    const parsed = parseGreenfieldRepairContent(raw, "src/App.tsx");
    assert.ok(parsed);
    assert.match(parsed!, /export default function App/);
  });
});

describe("buildGreenfieldRepairProviderPrompt", () => {
  it("uses compact prompt with TS errors and type defs (not full project list)", () => {
    const prompt = buildGreenfieldRepairProviderPrompt(
      {
        originalRequest: "Build FleetOps",
        planSummary: "Greenfield",
        planSource: "greenfield",
        modifiedFiles: ["src/App.tsx", "src/pages/Dashboard.tsx", "src/types.ts"],
        diagnostics: [
          {
            kind: "typescript",
            file: "src/pages/Dashboard.tsx",
            line: 4,
            column: 3,
            code: "TS2739",
            message:
              "Type '{ id: string; }' is missing the following properties from type 'Driver': email, phone",
          },
        ],
        primaryFailure: {
          kind: "typescript",
          file: "src/pages/Dashboard.tsx",
          line: 4,
          column: 3,
          code: "TS2739",
          message:
            "Type '{ id: string; }' is missing the following properties from type 'Driver': email, phone",
        },
        attemptNumber: 1,
        maxAttempts: 2,
        relatedTypeDefinitions:
          "export interface Driver {\n  email: string;\n  phone: string;\n}",
      },
      { path: "src/pages/Dashboard.tsx", content: SAMPLE },
    );

    assert.match(prompt, /TypeScript errors:/);
    assert.match(prompt, /TS2739/);
    assert.match(prompt, /Related type definitions:/);
    assert.match(prompt, /export interface Driver/);
    assert.doesNotMatch(prompt, /Generated file list:/);
    assert.doesNotMatch(prompt, /"diagnostics"/);
  });

  it("includes generated file list in strict fallback mode", () => {
    const prompt = buildGreenfieldRepairProviderPrompt(
      {
        originalRequest: "Build FleetOps",
        planSummary: "Greenfield",
        planSource: "greenfield",
        modifiedFiles: ["src/App.tsx", "src/pages/Dashboard.tsx"],
        diagnostics: [],
        primaryFailure: {
          kind: "typescript",
          file: "src/pages/Dashboard.tsx",
          line: 1,
          column: 1,
          message: "error",
        },
        attemptNumber: 2,
        maxAttempts: 2,
        strictFormat: true,
      },
      { path: "src/pages/Dashboard.tsx", content: SAMPLE },
    );

    assert.match(prompt, /Generated file list:/);
    assert.match(prompt, /STRICT OUTPUT REQUIREMENT/);
  });
});
