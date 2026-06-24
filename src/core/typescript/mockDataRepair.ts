import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import { findIconStubImport, parseImportSymbolName } from "@/core/typescript/iconLibraryRepair";

/** Rename `enrollmentDate: "Active"` style keys to `enrollmentStatus` and fix access sites. */
export function repairMisplacedStatusInDateField(content: string): string | null {
  let next = content;
  let changed = false;

  const keyRe = /\benrollmentDate:\s*(['"])(Active|Withdrawn|Graduated)\1/g;
  if (keyRe.test(content)) {
    next = content.replace(keyRe, 'enrollmentStatus: "$2"');
    changed = true;
  }

  if (next.includes("enrollmentStatus:")) {
    const accessFixed = next.replace(/\.enrollmentDate\b/g, ".enrollmentStatus");
    if (accessFixed !== next) {
      next = accessFixed;
      changed = true;
    }
  }

  if (!changed) return null;
  return next;
}

export function wrapScalarPropertyAsArray(
  line: string,
  property: string,
): string | null {
  const re = new RegExp(
    `(\\b${property}\\s*:\\s*)(['"][^'"]+['"])(\\s*[,}])`,
  );
  if (!re.test(line)) return null;
  return line.replace(re, "$1[$2]$3");
}

/** Wrap common mock scalar fields that should be arrays (e.g. subjects: "Math"). */
export function wrapAllScalarArrayProperties(content: string): string | null {
  const next = content.replace(
    /(\bsubjects\s*:\s*)(['"][^'"]+['"])(\s*,)/g,
    "$1[$2]$3",
  );
  return next === content ? null : next;
}

export function applyStringToArrayFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): { content: string; label: string } | null {
  if (diagnostic.code !== "TS2322") return null;
  if (!/Type 'string' is not assignable to type 'string\[\]'/.test(diagnostic.message)) {
    return null;
  }
  const propMatch = diagnostic.message.match(/Types of property '([^']+)' are incompatible/);
  const property = propMatch?.[1];
  if (!property) return null;

  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const fixed = wrapScalarPropertyAsArray(lines[idx]!, property);
  if (!fixed) return null;
  lines[idx] = fixed;
  return { content: lines.join("\n"), label: `wrapped ${property} scalar as array` };
}

export function applyUndefinedIndexFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): { content: string; label: string } | null {
  if (diagnostic.code !== "TS2538") return null;
  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx]!;
  const fixed = line.replace(
    /(\[[\w.]+\])(?!\s*\?\?)/,
    (match) => {
      const expr = match.slice(1, -1);
      if (expr.includes("??")) return match;
      return `[${expr} ?? ""]`;
    },
  );
  if (fixed === line) return null;
  lines[idx] = fixed;
  return { content: lines.join("\n"), label: "added fallback for optional index key" };
}

export function augmentStudentEnrollmentStatus(typesContent: string): string | null {
  if (!typesContent.includes("interface Student")) return null;
  if (/\benrollmentStatus\b/.test(typesContent)) return null;
  const next = typesContent.replace(
    /(interface Student\s*\{[\s\S]*?)(\n\})/,
    '$1\n  enrollmentStatus?: "Active" | "Withdrawn" | "Graduated";$2',
  );
  return next === typesContent ? null : next;
}

export function completeMockDocumentUrls(content: string): string | null {
  if (!content.includes("mockDocuments")) return null;
  const next = content.replace(
    /(fileSize:\s*'[^']*')(\s*\},)/g,
    (match, fileSizePart: string, close: string) => {
      if (match.includes("url:")) return match;
      return `${fileSizePart},\n  url: ""${close}`;
    },
  );
  return next === content ? null : next;
}

export function completeMockScheduleItemTimes(content: string): string | null {
  if (!content.includes("mockScheduleItems")) return null;
  let next = content;
  let changed = false;

  const withEndInline = next.replace(
    /startTime:\s*""\s*},/g,
    () => {
      changed = true;
      return "startTime: \"\",\n  endTime: \"\"\n},";
    },
  );
  next = withEndInline;

  const withBoth = next.replace(
    /(status:\s*'[^']*')\s*},/g,
    (match, statusPart: string) => {
      if (match.includes("startTime")) return match;
      changed = true;
      return `${statusPart},\n  startTime: "",\n  endTime: ""\n},`;
    },
  );
  next = withBoth;

  return changed ? next : null;
}

export function mapInvalidDocumentTypeLiterals(content: string): string | null {
  const next = content.replace(/type:\s*'Form'/g, "type: 'Handbook'");
  return next === content ? null : next;
}

export function referencesNoticeStatusType(content: string): boolean {
  return (
    /import\s+type\s+\{[^}]*\bNoticeStatus\b/.test(content) ||
    /getStatusBadgeClasses\s*\(\s*status:\s*NoticeStatus\b/.test(content)
  );
}

export function addStatusFallbackForBadgeProps(content: string): string | null {
  let next = content;
  let changed = false;
  const patterns = [
    [/status=\{student\.enrollmentStatus\}/g, 'status={student.enrollmentStatus as EnrollmentStatus}'],
    [/status=\{student\.enrollmentDate\}/g, 'status={student.enrollmentStatus as EnrollmentStatus}'],
    [/status=\{teacher\.employmentStatus\}/g, 'status={(teacher.employmentStatus ?? "Active") as EmploymentStatus}'],
    [/status=\{item\.status\}/g, 'status={(item.status ?? "Planned") as ScheduleItemStatus}'],
    [/status=\{supplier\.status\}/g, 'status={(supplier.status ?? "Active") as "Active" | "Inactive"}'],
  ] as const;
  for (const [re, replacement] of patterns) {
    const replaced = next.replace(re, replacement);
    if (replaced !== next) {
      next = replaced;
      changed = true;
    }
  }

  if (referencesNoticeStatusType(content) && !/getStatusBadgeClasses\([^)]*as NoticeStatus/.test(content)) {
    const replaced = next.replace(
      /getStatusBadgeClasses\((\w+\.status)(?:\s*\?\?\s*"[^"]+")?\)/g,
      'getStatusBadgeClasses(($1 ?? "sent") as NoticeStatus)',
    );
    if (replaced !== next) {
      next = replaced;
      changed = true;
    }
  }

  if (/HearingStatus/.test(content) && !/getStatusBadge\([^)]*as HearingStatus/.test(content)) {
    const hearingPatterns = [
      [
        /getStatusBadge\(\((\w+\.status)\s*\?\?\s*"Processed"\)\s+as\s+PayrollRunStatus\)/g,
        'getStatusBadge(($1 ?? "Scheduled") as HearingStatus)',
      ],
      [/getStatusBadge\((\w+\.status)\)/g, 'getStatusBadge(($1 ?? "Scheduled") as HearingStatus)'],
    ] as const;
    for (const [re, replacement] of hearingPatterns) {
      const replaced = next.replace(re, replacement);
      if (replaced !== next) {
        next = replaced;
        changed = true;
      }
    }
  }

  if (
    (/PayrollRunStatus|PayrollRun\b|mockPayroll/.test(content)) &&
    !/getStatusBadge\([^)]*as PayrollRunStatus/.test(content)
  ) {
    const replaced = next.replace(
      /getStatusBadge\((\w+\.status)\)/g,
      'getStatusBadge(($1 ?? "Processed") as PayrollRunStatus)',
    );
    if (replaced !== next) {
      next = replaced;
      changed = true;
    }
  }

  if (
    /BehaviorIncidentType/.test(content) &&
    !/getStatusBadge\([^)]*as BehaviorIncidentType/.test(content)
  ) {
    const replaced = next.replace(
      /getStatusBadge\((\w+\.incidentType)\)/g,
      'getStatusBadge(($1 ?? "Neutral") as BehaviorIncidentType)',
    );
    if (replaced !== next) {
      next = replaced;
      changed = true;
    }
  }

  return changed ? next : null;
}

const DUPLICATE_MOCK_PROPERTY_NAMES = [
  "level",
  "title",
  "url",
  "data",
  "studentId",
  "appointmentId",
  "clientName",
] as const;

/** Remove duplicate property lines introduced by repeated repair passes. */
export function collapseDuplicateMockProperties(content: string): string | null {
  let next = content;
  let changed = false;
  for (const property of DUPLICATE_MOCK_PROPERTY_NAMES) {
    const collapsed = collapseRepeatedPropertyLines(next, property);
    if (collapsed) {
      next = collapsed;
      changed = true;
    }
  }
  return changed ? next : null;
}

/** Remove consecutive duplicate property lines (same pass re-applied). */
export function collapseRepeatedPropertyLines(
  content: string,
  property: string,
): string | null {
  const consecutiveRe = new RegExp(
    `(^\\s*${property}:\\s*[^\\n]+,?\\s*\\n)(?:\\s*${property}:\\s*[^\\n]+,?\\s*\\n)+`,
    "gm",
  );
  const next = content.replace(consecutiveRe, "$1");
  return next === content ? null : next;
}

/** Fix mock document arrays corrupted by duplicate-url collapse (missing `},` between entries). */
export function repairBrokenDocumentMockArray(content: string): string | null {
  if (!content.includes("mockDocuments")) return null;
  let next = content;
  let changed = false;

  for (let round = 0; round < 6; round++) {
    const pass = next.replace(
      /(fileSize:\s*'[^']*',?)(\s*\n+)(?=\s*\{ id:)/g,
      (match, fileSizePart: string, gap: string) => {
        if (/url:/.test(match)) return match;
        changed = true;
        const size = fileSizePart.match(/'([^']+)'/)?.[1] ?? "";
        return `fileSize: '${size}',\n  url: "",\n},${gap}`;
      },
    );
    next = pass;
  }

  const fixedClose = next.replace(
    /(fileSize:\s*'[^']*',?)(\s*\n+)(?=\];)/g,
    (match, fileSizePart: string, gap: string) => {
      if (/url:/.test(match)) return match;
      changed = true;
      const size = fileSizePart.match(/'([^']+)'/)?.[1] ?? "";
      return `fileSize: '${size}',\n  url: "",\n},${gap}`;
    },
  );
  next = fixedClose;

  const fixedUrlGap = next.replace(
    /url:\s*"",\s*\n(?=\s*\{ id:)/g,
    () => {
      changed = true;
      return 'url: "",\n},\n';
    },
  );
  next = fixedUrlGap;

  return changed ? next : null;
}

/** Fix object-typed fields that were incorrectly filled with empty strings. */
export function repairStringForObjectProperties(content: string): string | null {
  let next = content.replace(
    /emergencyContact:\s*""/g,
    'emergencyContact: { name: "", relationship: "", phone: "" }',
  );
  next = next.replace(
    /contactInfo:\s*""/g,
    'contactInfo: { phone: "", email: "", address: { street: "", city: "", state: "", zip: "" } }',
  );
  return next === content ? null : next;
}

/** Complete StudentProfile mock rows and derive name parts from a single `name` field. */
export function repairOptionalDateConstruction(content: string): string | null {
  let next = content.replace(
    /new Date\((\w+)\.timestamp\)/g,
    'new Date($1.timestamp ?? $1.createdAt ?? "")',
  );
  next = next.replace(
    /new Date\((\w+)\.createdAt\)/g,
    'new Date($1.createdAt ?? "")',
  );
  next = next.replace(
    /new Date\((\w+)\.expectedDate\)/g,
    'new Date($1.expectedDate ?? $1.expectedDeliveryDate ?? "")',
  );
  next = next.replace(
    /new Date\((\w+)\.orderDate\)/g,
    'new Date($1.orderDate ?? "")',
  );
  return next === content ? null : next;
}

export function repairStockMovementMockLiterals(content: string): string | null {
  if (!/mockStockMovements/.test(content)) return null;
  let next = content.replace(
    /(\bid:\s*"[^"]+",)\s*\n(\s*productName:)/g,
    (match, idLine: string, productLine: string) => {
      if (/productId:/.test(match)) return match;
      return `${idLine}\n    productId: "",\n${productLine}`;
    },
  );
  next = next.replace(/\bmove\.createdAt\b/g, "move.timestamp");
  return next === content ? null : next;
}

export function repairPurchaseOrderMockLiterals(content: string): string | null {
  if (!/mockPurchaseOrders/.test(content)) return null;
  let next = content;
  let changed = false;

  const itemsFixed = next.replace(
    /items:\s*\{\s*productId:\s*"[^"]*"\s*,\s*quantity:\s*\d+\s*,\s*unitPrice:\s*\d+\s*\}/g,
    'items: [{ productId: "", quantity: 0, unitPrice: 0 }]',
  );
  if (itemsFixed !== next) {
    next = itemsFixed;
    changed = true;
  }

  const commaFixed = next.replace(
    /(createdAt:\s*"[^"]+")\s*\n(\s*poNumber:)/g,
    "$1,\n$2",
  );
  if (commaFixed !== next) {
    next = commaFixed;
    changed = true;
  }

  return changed ? next : null;
}

/** Remove page-local SVG icon fallbacks once IconStub imports are wired. */
export function repairReportPageLocalIconStubs(content: string): string | null {
  if (!/availableReports/.test(content)) return null;
  let next = content
    .replace(/\n\/\/ Add [^\n]+\nconst FileWarning[\s\S]*?const Users[\s\S]*?;\n?/m, "\n")
    .replace(/\nconst FileWarning = \(props: any\) => <svg[\s\S]*?;\n?/m, "\n")
    .replace(/\nconst Users = \(props: any\) => <svg[\s\S]*?;\n?/m, "\n");
  return next === content ? null : next;
}

export function repairReportsMissingIconImports(content: string): string | null {
  if (!/availableReports/.test(content) || !/from\s+['"][^'"]*IconStub['"]/.test(content)) {
    return null;
  }
  let working = repairReportPageLocalIconStubs(content) ?? content;
  const reportBlock = working.match(
    /const availableReports[\s\S]*?\];/,
  )?.[0];
  if (!reportBlock) return null;

  const localSymbols = new Set(
    [...working.matchAll(/(?:const|function)\s+([A-Z][A-Za-z0-9]*)\s*[=(]/g)].map((m) => m[1]!),
  );

  const used = new Set<string>();
  for (const match of reportBlock.matchAll(/\bicon:\s*([A-Z][A-Za-z0-9]*)\b/g)) {
    const symbol = match[1]!;
    if (symbol === "ComponentType" || symbol === "FC" || symbol === "React") continue;
    if (localSymbols.has(symbol)) continue;
    used.add(symbol);
  }
  if (used.size === 0) return working === content ? null : working;

  const importMatch = findIconStubImport(working);
  if (!importMatch) return null;
  const imported = new Set(
    importMatch.imports.split(",").map((part) => parseImportSymbolName(part)).filter(Boolean),
  );
  const missing = [...used].filter((sym) => !imported.has(sym));
  if (missing.length === 0) return null;

  const insertion = missing.map((sym) => `, ${sym}`).join("");
  const closeBrace = importMatch.full.lastIndexOf("}");
  if (closeBrace < 0) return null;
  const nextImport =
    importMatch.full.slice(0, closeBrace) + insertion + importMatch.full.slice(closeBrace);
  let next = working.replace(importMatch.full, nextImport);
  if (/icon:\s*\(props:/.test(next) || /icon:\s*FC</.test(next)) {
    const relaxed = relaxReportIconCallbackTypes(next);
    if (relaxed) next = relaxed;
  }
  return next === content ? null : next;
}

export function relaxReportIconCallbackTypes(content: string): string | null {
  const needsInterfaceRelax =
    /icon:\s*\(props:\s*\{[^}]+\}\)\s*=>\s*JSX\.Element/.test(content) ||
    /icon:\s*FC<\{ className\?: string \}>/.test(content) ||
    /icon:\s*React\.ComponentType<\{ className\?: string \}>/.test(content);
  if (!needsInterfaceRelax) return null;

  let next = content
    .replace(
      /icon:\s*\(props:\s*\{[^}]+\}\)\s*=>\s*JSX\.Element/g,
      "icon: ComponentType<{ className?: string }>",
    )
    .replace(
      /icon:\s*FC<\{ className\?: string \}>/g,
      "icon: ComponentType<{ className?: string }>",
    )
    .replace(
      /icon:\s*React\.ComponentType<\{ className\?: string \}>/g,
      "icon: ComponentType<{ className?: string }>",
    );

  if (!/import\s+type\s+\{[^}]*\bComponentType\b/.test(next)) {
    if (/import type \{ FC \} from "react";/.test(next)) {
      next = next.replace(
        /import type \{ FC \} from "react";/,
        'import type { ComponentType } from "react";',
      );
    } else {
      const reactImport = next.match(/^import\s+type\s+\{([^}]+)\}\s+from\s+["']react["'];?\n/m);
      if (reactImport && !reactImport[1]!.includes("ComponentType")) {
        next = next.replace(
          reactImport[0],
          `import type { ${reactImport[1]!.trim()}, ComponentType } from "react";\n`,
        );
      } else if (!reactImport) {
        next = `import type { ComponentType } from "react";\n${next}`;
      }
    }
  }

  return next === content ? null : next;
}

export function repairExtendedCaseMockLiterals(content: string): string | null {
  if (!/interface MockCase extends Case/.test(content) || !/const mockCases/.test(content)) {
    return null;
  }
  const mockStart = content.indexOf("const mockCases");
  if (mockStart < 0) return null;

  let tail = content.slice(mockStart);
  let changed = false;

  tail = tail.replace(
    /dateOpened:\s*"([^"]*)"\s*\},/g,
    (match, date: string) => {
      if (/description:/.test(match)) return match;
      changed = true;
      return `dateOpened: "${date}",\n    description: ""\n  },`;
    },
  );

  tail = tail.replace(
    /dateOpened:\s*"([^"]*)",(\s*\n\s*\},)/g,
    (match, date: string, close: string) => {
      if (/description:/.test(match)) return match;
      changed = true;
      return `dateOpened: "${date}",\n    description: "",${close}`;
    },
  );

  if (!changed) return null;
  return content.slice(0, mockStart) + tail;
}

export function repairStudentProfileMockLiterals(content: string): string | null {
  if (!/mockStudents\s*:/.test(content) || !/StudentProfile/.test(content)) return null;

  let next = content;
  const stringObjFix = repairStringForObjectProperties(next);
  if (stringObjFix) next = stringObjFix;

  const dateExpr = "new Date().toISOString().slice(0, 10)";
  const emergencyObj = '{ name: "", relationship: "", phone: "" }';

  next = next.replace(
    /(\{[^}]*name:\s*"([^"]+)"[^}]*?)firstName:\s*""([^}]*?)lastName:\s*""/g,
    (_match, prefix: string, fullName: string, suffix: string) => {
      const parts = fullName.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || "";
      return `${prefix}firstName: "${firstName}"${suffix}lastName: "${lastName}"`;
    },
  );

  next = next.replace(
    /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*gradeLevel:\s*(\d+),\s*enrollmentStatus:\s*"([^"]+)",\s*gpa:\s*([\d.]+)\s*\}/g,
    (_match, id: string, name: string, grade: string, status: string, gpa: string) => {
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || "";
      return `{ id: "${id}", name: "${name}", gradeLevel: ${grade}, enrollmentStatus: "${status}", gpa: ${gpa}, firstName: "${firstName}", lastName: "${lastName}", dateOfBirth: ${dateExpr}, enrollmentDate: ${dateExpr}, emergencyContact: ${emergencyObj} }`;
    },
  );

  const mockStart = next.indexOf("const mockStudents");
  if (mockStart >= 0) {
    const tail = next.slice(mockStart);
    const fixedTail = tail.replace(
      /(enrollmentDate:\s*[^,\n]+)(\s*\n\s*\},)/g,
      (match, pre: string, close: string) => {
        if (/emergencyContact:/.test(match)) return match;
        return `${pre},\n  emergencyContact: ${emergencyObj}${close}`;
      },
    );
    if (fixedTail !== tail) next = next.slice(0, mockStart) + fixedTail;
  }

  return next === content ? null : next;
}

export function repairStudentListMockLiterals(content: string): string | null {
  if (!/mockStudents\s*:/.test(content) || !/Student\[\]/.test(content)) return null;
  if (/StudentProfile/.test(content)) return null;
  const dateExpr = "new Date().toISOString().slice(0, 10)";
  let changed = false;
  const next = content.replace(
    /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*grade:\s*(\d+),\s*status:\s*'([^']+)',\s*avatarUrl:\s*'([^']*)'\s*\}/g,
    (match, id: string, name: string, grade: string, status: string, avatarUrl: string) => {
      if (/firstName:/.test(match)) return match;
      changed = true;
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || "";
      return `{ id: '${id}', name: '${name}', grade: ${grade}, status: '${status}', avatarUrl: '${avatarUrl}', studentId: '${id}', firstName: '${firstName}', lastName: '${lastName}', dateOfBirth: ${dateExpr}, classId: "", createdAt: ${dateExpr}, updatedAt: ${dateExpr} }`;
    },
  );
  return changed ? next : null;
}

export function repairTeacherListMockLiterals(content: string): string | null {
  if (!/mockTeachers\s*:/.test(content) || !/Teacher\[\]/.test(content)) return null;
  const dateExpr = "new Date().toISOString().slice(0, 10)";
  let changed = false;
  const next = content.replace(
    /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*subject:\s*'([^']+)',\s*status:\s*'([^']+)',\s*avatarUrl:\s*'([^']*)'\s*\}/g,
    (match, id: string, name: string, subject: string, status: string, avatarUrl: string) => {
      if (/firstName:/.test(match)) return match;
      changed = true;
      const parts = name.replace(/^(Mr\.|Ms\.|Dr\.)\s+/i, "").trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || "";
      return `{ id: '${id}', name: '${name}', subject: '${subject}', status: '${status}', avatarUrl: '${avatarUrl}', teacherId: '${id}', firstName: '${firstName}', lastName: '${lastName}', email: "", createdAt: ${dateExpr}, updatedAt: ${dateExpr} }`;
    },
  );
  return changed ? next : null;
}

export function repairMisappliedStatusCasts(content: string): string | null {
  let next = content;
  let changed = false;
  const hasNoticeStatusType = referencesNoticeStatusType(content);

  if (
    !/PayrollRun\b|mockPayroll|PayrollSummary/.test(content) &&
    /as PayrollRunStatus/.test(content) &&
    /HearingStatus/.test(content)
  ) {
    const hearingFix = next
      .replace(
        /\((\w+\.status)\s*\?\?\s*"Processed"\)\s+as\s+PayrollRunStatus/g,
        '($1 ?? "Scheduled") as HearingStatus',
      )
      .replace(/as PayrollRunStatus/g, "as HearingStatus");
    if (hearingFix !== next) {
      next = hearingFix;
      changed = true;
    }
  }

  if (!hasNoticeStatusType && /as NoticeStatus/.test(content)) {
    const noticeFix = next.replace(
      /getStatusBadgeClasses\(\((\w+\.status)\s*\?\?\s*"[^"]+"\)\s+as\s+NoticeStatus\)/g,
      "getStatusBadgeClasses($1)",
    );
    if (noticeFix !== next) {
      next = noticeFix;
      changed = true;
    }
  }

  return changed ? next : null;
}

export function repairReportMockLiterals(content: string): string | null {
  if (!/mockRecentReports|mockReports/.test(content)) return null;
  const start = content.search(/const\s+mock(?:Recent)?Reports/);
  if (start < 0) return null;
  const end = content.indexOf("];", start);
  if (end < 0) return null;
  let block = content.slice(start, end);
  let changed = false;
  const withType = block.replace(/type:\s*""/g, () => {
    changed = true;
    return 'type: "Case Summary"';
  });
  block = withType;
  const withData = block.replace(
    /(dateGenerated:\s*[^}\n]+)(\s*\},)/g,
    (match, prefix: string, close: string) => {
      if (/data:/.test(match)) return match;
      changed = true;
      return `${prefix},\n  data: {}${close}`;
    },
  );
  block = withData;
  block = block.replace(/data:\s*""/g, () => {
    changed = true;
    return "data: {}";
  });
  return changed ? content.slice(0, start) + block + content.slice(end) : null;
}

export function repairReportIconJsxUsage(content: string): string | null {
  if (!/const Icon = report\.icon/.test(content)) return null;
  const iconImport = content.match(/import\s+\{([^}]+)\}\s+from\s+["'][^"']*IconStub["']/);
  const firstIcon =
    iconImport?.[1]
      ?.split(",")
      .map((part) => part.trim().split(/\s+as\s+/)[0]!.trim())
      .find((sym) => /^[A-Z]/.test(sym)) ?? "BarChart3";
  const next = content.replace(
    /const Icon = report\.icon;/g,
    `const Icon = (report.icon ?? ${firstIcon}) as typeof ${firstIcon};`,
  );
  return next === content ? null : next;
}

export function repairHearingMockLiterals(content: string): string | null {
  if (!/mockHearings/.test(content)) return null;
  const next = content.replace(
    /(caseName:\s*"([^"]+)",[\s\S]*?status:\s*"[^"]+",)(?=\s*\n\s*caseId:)/g,
    (match, prefix: string, caseName: string) => {
      if (/title:/.test(match)) return match;
      return `${prefix}\n    title: "${caseName}",`;
    },
  );
  return next === content ? null : next;
}

export function repairBehaviorLogMockLiterals(content: string): string | null {
  if (!/mockBehaviorLogs/.test(content)) return null;
  let changed = false;
  const next = content.replace(
    /incidentType:\s*'(Positive|Negative|Neutral)'/g,
    (match, incidentType: string, offset: number) => {
      const rest = content.slice(offset);
      const end = rest.search(/\n\s*\},/);
      const window = end >= 0 ? rest.slice(0, end) : rest.slice(0, 400);
      if (/level:/.test(window)) return match;
      const level =
        incidentType === "Negative" ? "high" : incidentType === "Positive" ? "low" : "medium";
      changed = true;
      return `${match},\n  level: '${level}'`;
    },
  );
  return changed ? next : null;
}

export function repairVisitNoteMockLiterals(content: string): string | null {
  if (!/mockVisitNotes/.test(content)) return null;
  let changed = false;
  const next = content.replace(
    /(\{[^{}]*summary:\s*"[^"]*")\s*\}/g,
    (match, prefix: string) => {
      if (/appointmentId:/.test(match)) return match;
      changed = true;
      return `${prefix}, appointmentId: "", patientId: "", providerId: "", chiefComplaint: "", assessment: "", plan: "", createdAt: new Date().toISOString().slice(0, 10) }`;
    },
  );
  return changed ? next : null;
}

export function augmentReportInfoIconType(typesSource: string): string | null {
  if (!/interface ReportInfo\b/.test(typesSource)) return null;
  if (!/icon\??\s*:\s*unknown/.test(typesSource)) return null;
  let next = typesSource.replace(
    /icon\??\s*:\s*unknown/,
    "icon: ComponentType<{ className?: string }>",
  );
  if (!/import\s+type\s+\{[^}]*\bComponentType\b/.test(next)) {
    next = `import type { ComponentType } from "react";\n${next}`;
  }
  return next === typesSource ? null : next;
}

export function augmentCaseRelaxedFields(typesSource: string): string | null {
  if (!/export type Case\b/.test(typesSource)) return null;
  let next = typesSource;
  let changed = false;
  for (const field of ["clientName", "dateFiled"] as const) {
    if (new RegExp(`\\b${field}\\??\\s*:`).test(next)) continue;
    next = next.replace(
      /(export type Case = \{[\s\S]*?)(\n\};)/,
      `$1\n  ${field}?: string;$2`,
    );
    changed = true;
  }
  return changed ? next : null;
}

export function augmentBehaviorLogDisplayFields(typesSource: string): string | null {
  if (!/interface BehaviorLog\b/.test(typesSource)) return null;
  let next = typesSource;
  let changed = false;
  if (
    /BehaviorIncidentType/.test(next) &&
    /incidentType\??\s*:\s*string/.test(next)
  ) {
    next = next.replace(
      /incidentType\??\s*:\s*string/g,
      "incidentType?: BehaviorIncidentType",
    );
    changed = true;
  }
  for (const field of ["studentName", "description", "reportedBy"] as const) {
    if (new RegExp(`\\b${field}\\??\\s*:`).test(next)) continue;
    next = next.replace(
      /(interface BehaviorLog\s*\{[\s\S]*?)(\n\})/,
      `$1\n  ${field}?: string;$2`,
    );
    changed = true;
  }
  if (!/\bincidentType\??\s*:/.test(next) && /BehaviorIncidentType/.test(next)) {
    next = next.replace(
      /(interface BehaviorLog\s*\{[\s\S]*?)(\n\})/,
      `$1\n  incidentType?: BehaviorIncidentType;$2`,
    );
    changed = true;
  }
  return changed ? next : null;
}

/** Rename contentSnippet to content when Note mocks use the wrong key. */
export function repairNoteMockLiterals(content: string): string | null {
  if (!/mockNotes\s*:/.test(content)) return null;
  let next = content;
  if (/contentSnippet:/.test(content)) {
    next = next.replace(/contentSnippet:/g, "content:");
  }
  if (/\.contentSnippet\b/.test(next)) {
    next = next.replace(/\.contentSnippet\b/g, ".content");
  }
  return next === content ? null : next;
}

/** Add optional Hearing fields commonly generated in mock data. */
export function augmentHearingTypeFields(typesSource: string): string | null {
  if (!/export type Hearing/.test(typesSource)) return null;
  let next = typesSource;
  let changed = false;
  for (const field of ["time", "type"] as const) {
    if (new RegExp(`\\b${field}\\??\\s*:`).test(next)) continue;
    next = next.replace(
      /(export type Hearing = (?:BaseEntity & )?\{[\s\S]*?)(\n\};)/,
      `$1\n  ${field}?: string;$2`,
    );
    changed = true;
  }
  return changed ? next : null;
}

/** Relax Note tag arrays from unknown[] to string[] for JSX keys. */
export function relaxNoteTagTypes(typesSource: string): string | null {
  if (!/export type Note/.test(typesSource)) return null;
  const next = typesSource.replace(/tags\?:\s*unknown\[\]/g, "tags?: string[]");
  return next === typesSource ? null : next;
}
