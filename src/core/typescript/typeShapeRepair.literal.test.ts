import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyTs2353LiteralPropertyFix } from "@/core/typescript/typeShapeRepair";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";

describe("applyTs2353LiteralPropertyFix", () => {
  it("renames clientName to client when Case defines client", async () => {
    const types = [
      "export interface Case {",
      "  id: string;",
      "  client: string;",
      "}",
    ].join("\n");
    const source = [
      "const mockCases: Case[] = [{",
      "  id: '1',",
      "  clientName: 'Acme',",
      "}];",
    ].join("\n");
    const diagnostic: TypeScriptDiagnostic = {
      file: "src/pages/Cases.tsx",
      line: 1,
      column: 28,
      code: "TS2353",
      message:
        "Object literal may only specify known properties, and 'clientName' does not exist in type 'Case'.",
      category: "error",
      raw: "",
    };
    const result = await applyTs2353LiteralPropertyFix(source, diagnostic, async (path) =>
      path === "src/types.ts" ? types : null,
    );
    assert.ok(result);
    assert.match(result!.content, /client:\s*'Acme'/);
    assert.doesNotMatch(result!.content, /clientName/);
  });
});
