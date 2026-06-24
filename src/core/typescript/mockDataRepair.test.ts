import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addStatusFallbackForBadgeProps,
  applyUndefinedIndexFix,
  repairBehaviorLogMockLiterals,
  repairHearingMockLiterals,
  repairMisappliedStatusCasts,
  repairMisplacedStatusInDateField,
  repairReportMockLiterals,
  repairStringForObjectProperties,
  repairStudentListMockLiterals,
  repairVisitNoteMockLiterals,
  collapseDuplicateMockProperties,
  wrapAllScalarArrayProperties,
} from "@/core/typescript/mockDataRepair";
import { addNullishFallbackOnLine } from "@/core/typescript/optionalAccessRepair";
import { repairNullishBeforeMethodCall } from "@/core/typescript/syntaxCorruptionRepair";

describe("mockDataRepair", () => {
  it("renames enrollmentDate with status literals to enrollmentStatus", () => {
    const source = [
      '{ enrollmentDate: "Active", gpa: 3.8 }',
      "<StatusBadge status={student.enrollmentDate} />",
    ].join("\n");
    const fixed = repairMisplacedStatusInDateField(source);
    assert.ok(fixed);
    assert.match(fixed!, /enrollmentStatus: "Active"/);
    assert.match(fixed!, /student\.enrollmentStatus/);
  });

  it("wraps subjects scalars as arrays", () => {
    const source = '{ subjects: "Mathematics", employmentStatus: "Active" },';
    const fixed = wrapAllScalarArrayProperties(source);
    assert.ok(fixed);
    assert.match(fixed!, /subjects: \["Mathematics"\]/);
  });

  it("adds fallback for optional Record index keys", () => {
    const source = "statusColors[tech.status]";
    const fixed = applyUndefinedIndexFix(source, {
      code: "TS2538",
      message: "Type 'undefined' cannot be used as an index type.",
      file: "src/pages/Technicians.tsx",
      line: 1,
      column: 20,
      category: "error",
      raw: "",
    });
    assert.ok(fixed);
    assert.match(fixed!.content, /tech\.status \?\? ""/);
  });

  it("does not apply NoticeStatus casts on driver status badges", () => {
    const fixed = addStatusFallbackForBadgeProps(
      'const x = getStatusBadgeClasses(driver.status);',
    );
    assert.equal(fixed, null);
  });

  it("applies NoticeStatus casts only on notice pages", () => {
    const source = [
      "import type { NoticeStatus } from '../types';",
      "getStatusBadgeClasses(notice.status)",
    ].join("\n");
    const fixed = addStatusFallbackForBadgeProps(source);
    assert.ok(fixed);
    assert.match(fixed!, /as NoticeStatus/);
  });

  it("reverts misapplied NoticeStatus casts", () => {
    const source =
      'getStatusBadgeClasses((driver.status ?? "sent") as NoticeStatus)';
    const fixed = repairMisappliedStatusCasts(source);
    assert.ok(fixed);
    assert.match(fixed!, /getStatusBadgeClasses\(driver\.status\)/);
  });

  it("reverts misapplied PayrollRunStatus on hearing pages", () => {
    const source = [
      "import type { HearingStatus } from '../types';",
      'getStatusBadge((hearing.status ?? "Processed") as PayrollRunStatus)',
    ].join("\n");
    const fixed = repairMisappliedStatusCasts(source);
    assert.ok(fixed);
    assert.match(fixed!, /as HearingStatus/);
  });

  it("fills contactInfo object literals", () => {
    const source = 'contactInfo: ""';
    const fixed = repairStringForObjectProperties(source);
    assert.ok(fixed);
    assert.match(fixed!, /phone: ""/);
    assert.match(fixed!, /address:/);
  });

  it("adds hearing title from case name", () => {
    const source = [
      "const mockHearings = [",
      '  { caseName: "Smith v. Acme", status: "Scheduled",',
      '  caseId: ""},',
      "];",
    ].join("\n");
    const fixed = repairHearingMockLiterals(source);
    assert.ok(fixed);
    assert.match(fixed!, /title: "Smith v\. Acme"/);
  });

  it("adds behavior log level once per entry", () => {
    const source = [
      "const mockBehaviorLogs = [",
      "  { incidentType: 'Negative', studentId: '',",
      "  actionTaken: ''},",
      "];",
    ].join("\n");
    const once = repairBehaviorLogMockLiterals(source);
    assert.ok(once);
    assert.match(once!, /level: 'high'/);
    const twice = repairBehaviorLogMockLiterals(once!);
    assert.equal(twice, null);
  });

  it("completes visit note mock required fields", () => {
    const source =
      '{ id: "vn001", patientName: "A", providerName: "B", visitDate: "2023-10-25", summary: "ok" }';
    const fixed = repairVisitNoteMockLiterals(
      `const mockVisitNotes = [${source}];`,
    );
    assert.ok(fixed);
    assert.match(fixed!, /appointmentId:/);
    assert.match(fixed!, /chiefComplaint:/);
  });

  it("completes student list mock required fields", () => {
    const source =
      "{ id: 'S001', name: 'Alice Johnson', grade: 10, status: 'active', avatarUrl: '' }";
    const fixed = repairStudentListMockLiterals(`const mockStudents: Student[] = [${source}];`);
    assert.ok(fixed);
    assert.match(fixed!, /firstName: 'Alice'/);
    assert.match(fixed!, /studentId: 'S001'/);
  });

  it("adds report data objects", () => {
    const source = [
      "const mockRecentReports = [",
      '  { id: "R-001", type: "", dateGenerated: new Date().toISOString().slice(0, 10)},',
      "];",
    ].join("\n");
    const fixed = repairReportMockLiterals(source);
    assert.ok(fixed);
    assert.match(fixed!, /data: \{\}/);
    assert.match(fixed!, /type: "Case Summary"/);
  });

  it("does not double-wrap hearing status badge casts", () => {
    const source =
      'getStatusBadge((hearing.status ?? "Scheduled") as HearingStatus)';
    const fixed = addStatusFallbackForBadgeProps(
      `import type { HearingStatus } from "../types";\n${source}`,
    );
    assert.equal(fixed, null);
  });

  it("collapses duplicate level properties", () => {
    const source = [
      "const mockBehaviorLogs = [",
      "  { incidentType: 'Negative',",
      "  level: 'high',",
      "  level: 'high',",
      "  actionTaken: ''},",
      "];",
    ].join("\n");
    const fixed = collapseDuplicateMockProperties(source);
    assert.ok(fixed);
    assert.equal((fixed!.match(/level:/g) ?? []).length, 1);
  });
});

describe("optionalAccessRepair string methods", () => {
  it("uses empty string fallback before toLowerCase", () => {
    const line = "note.patientName.toLowerCase().includes(term)";
    const fixed = addNullishFallbackOnLine(line, "note.patientName");
    assert.ok(fixed);
    assert.match(fixed!, /note\.patientName \?\? ""/);
  });
});

describe("syntaxCorruptionRepair numeric nullish strings", () => {
  it("fixes numeric nullish before toLowerCase", () => {
    const source = "(note.patientName ?? 0).toLowerCase().includes(term)";
    const fixed = repairNullishBeforeMethodCall(source);
    assert.ok(fixed);
    assert.match(fixed!, /note\.patientName \?\? ""/);
  });
});
