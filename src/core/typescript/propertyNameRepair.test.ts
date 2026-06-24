import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyWrongPropertyNameFix,
  isSemanticallyRiskyRename,
  parsePropertyRenameSuggestion,
  renamePropertyKeyInLine,
} from "@/core/typescript/propertyNameRepair";

describe("propertyNameRepair", () => {
  it("parses TS2561 rename suggestions", () => {
    const parsed = parsePropertyRenameSuggestion(
      "Object literal may only specify known properties, but 'department' does not exist in type 'Employee'. Did you mean to write 'departmentId'?",
    );
    assert.deepEqual(parsed, { wrong: "department", suggested: "departmentId" });
  });

  it("renames object property keys on a line", () => {
    const line = "  { id: '1', department: 'HR', name: 'Ann' },";
    const next = renamePropertyKeyInLine(line, "department", "departmentId");
    assert.match(next!, /departmentId:/);
    assert.doesNotMatch(next!, /department:/);
  });

  it("applies TS2561 diagnostic fix", () => {
    const source = "const row = { event: 'abc' };\n";
    const fixed = applyWrongPropertyNameFix(source, {
      code: "TS2561",
      message:
        "Object literal may only specify known properties, but 'event' does not exist in type 'Guest'. Did you mean to write 'eventId'?",
      file: "src/pages/Guests.tsx",
      line: 1,
      column: 15,
      category: "error",
      raw: "",
    });
    assert.ok(fixed);
    assert.match(fixed!.content, /eventId:/);
  });

  it("blocks risky status-to-date renames", () => {
    assert.equal(
      isSemanticallyRiskyRename("enrollmentStatus", "enrollmentDate"),
      true,
    );
    assert.equal(isSemanticallyRiskyRename("enrollDate", "enrollmentDate"), false);
  });
});
