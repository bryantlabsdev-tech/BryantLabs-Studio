import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { restoreRelaxedPageMockTypes, extractExportedTypeNames } from "@/core/typescript/relaxedMockRestore";
import { repairStudentProfileMockLiterals } from "@/core/typescript/mockDataRepair";

describe("relaxedMockRestore", () => {
  it("restores Case[] mocks on pages when Case exists in types.ts", () => {
    const types = "export type Case = { id: string; title: string; status: string; };\n";
    const known = extractExportedTypeNames(types);
    const source = [
      'import { useState } from "react";',
      "const mockCases: Array<Record<string, unknown>> = [{ id: '1', title: 'T', status: 'Open' }];",
      "const Cases = () => {",
      "  const [cases] = useState<Array<Record<string, unknown>>>(mockCases);",
      "  return null;",
      "};",
    ].join("\n");
    const fixed = restoreRelaxedPageMockTypes(source, "src/pages/Cases.tsx", known);
    assert.ok(fixed);
    assert.match(fixed!, /const mockCases: Case\[\]/);
    assert.match(fixed!, /useState<Case\[\]>/);
    assert.match(fixed!, /import type \{ Case \}/);
  });
});

describe("repairStudentProfileMockLiterals", () => {
  it("completes compact student mocks and fixes emergencyContact", () => {
    const source = [
      "interface StudentProfile extends Student { name: string; gpa: number; }",
      "const mockStudents: StudentProfile[] = [",
      '  { id: "S003", name: "Charlie Brown", gradeLevel: 9, enrollmentStatus: "Withdrawn", gpa: 2.5 },',
      '  { id: "S001", name: "Alice Johnson", gradeLevel: 10, enrollmentStatus: "Active", gpa: 3.8, firstName: "", lastName: "", dateOfBirth: "2020-01-01", enrollmentDate: "2020-01-01", emergencyContact: "" },',
      "];",
    ].join("\n");
    const fixed = repairStudentProfileMockLiterals(source);
    assert.ok(fixed);
    assert.match(fixed!, /emergencyContact: \{ name: "", relationship: "", phone: "" \}/);
    assert.match(fixed!, /firstName: "Alice"/);
    assert.match(fixed!, /firstName: "Charlie"/);
  });
});
