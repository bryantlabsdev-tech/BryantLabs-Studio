import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simplifyIntersectionTypeInFile } from "@/core/typescript/intersectionTypeRepair";

describe("intersectionTypeRepair", () => {
  it("simplifies impossible Patient intersection annotations above mock literals", () => {
    const source = [
      "const mockPatients: (Patient & { id: string; name: string; dob: string; phone: string; lastVisit: string; })[] = [",
      "  { id: 'p1', name: 'Ann', dob: '2000-01-01', phone: '555', lastVisit: '2024-01-01' },",
      "];",
    ].join("\n");

    const fixed = simplifyIntersectionTypeInFile(source, {
      code: "TS2322",
      message:
        "Type '{ id: string; name: string; dob: string; phone: string; lastVisit: string; }' is not assignable to type 'Patient & { id: string; name: string; dob: string; phone: string; lastVisit: string; }'.",
      file: "src/pages/Patients.tsx",
      line: 2,
      column: 3,
      category: "error",
      raw: "",
    });

    assert.ok(fixed);
    assert.doesNotMatch(fixed!, /Patient\s*&/);
    assert.match(fixed!, /id: string; name: string/);
  });

  it("does not rewrite unrelated intersections", () => {
    const source = "type Combined = Foo & Bar;\nconst x: Combined = {} as any;\n";
    const fixed = simplifyIntersectionTypeInFile(source, {
      code: "TS2322",
      message: "Type '{}' is not assignable to type 'Foo & Bar'.",
      file: "src/x.ts",
      line: 2,
      column: 5,
      category: "error",
      raw: "",
    });
    assert.equal(fixed, null);
  });
});
