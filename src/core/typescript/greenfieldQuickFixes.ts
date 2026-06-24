import { sanitizeAppIntegration } from "@/core/greenfield/appIntegrationSanitizer";
import { shouldAlignUseStateWithRelaxedMock } from "@/core/greenfield/repairConvergencePolicy";
import { normalizeNamedComponentExport } from "@/core/typescript/exportImportRepair";
import { upgradeIconStubModule, repairInvalidIconStubExports, repairIconRouterSymbolCollisions, repairIconLocalExportNameCollisions } from "@/core/typescript/iconLibraryRepair";
import { applySyntaxCorruptionRepairs } from "@/core/typescript/syntaxCorruptionRepair";
import {
  fixCorruptedLayoutElementProps,
  fixMalformedOptionalProps,
  cleanCorruptedTypeDefinitions,
  relaxLayoutPropsInterfaces,
} from "@/core/typescript/projectWideRepairs";
import {
  alignUseStateWithRelaxedMock,
  relaxExhaustiveRecordAnnotation,
} from "@/core/typescript/intersectionTypeRepair";
import {
  repairMisplacedStatusInDateField,
  wrapAllScalarArrayProperties,
  completeMockDocumentUrls,
  completeMockScheduleItemTimes,
  mapInvalidDocumentTypeLiterals,
  addStatusFallbackForBadgeProps,
  augmentStudentEnrollmentStatus,
  collapseRepeatedPropertyLines,
  repairBrokenDocumentMockArray,
} from "@/core/typescript/mockDataRepair";

const ROUTER_SYMBOLS = [
  "Route",
  "Routes",
  "Link",
  "NavLink",
  "Outlet",
  "useNavigate",
  "useParams",
  "useLocation",
] as const;

function parseNamedImports(line: string): string[] {
  const brace = line.match(/\{([^}]+)\}/);
  if (!brace?.[1]) return [];
  return brace[1]
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/\s+as\s+/)[0]!.trim());
}

function detectUsedRouterSymbols(content: string): string[] {
  const used: string[] = [];
  for (const sym of ROUTER_SYMBOLS) {
    if (new RegExp(`\\b${sym}\\b`).test(content)) used.push(sym);
  }
  if (/<Route[\s>]/.test(content) && !used.includes("Route")) used.push("Route");
  if (/<Routes[\s>]/.test(content) && !used.includes("Routes")) used.push("Routes");
  if (/<Link[\s>]/.test(content) && !used.includes("Link")) used.push("Link");
  if (/<NavLink[\s>]/.test(content) && !used.includes("NavLink")) used.push("NavLink");
  if (/<Outlet[\s/>]/.test(content) && !used.includes("Outlet")) used.push("Outlet");
  return [...new Set(used)];
}

/** Add missing react-router-dom named imports when Route/Routes/Link are used. */
export function ensureReactRouterImports(content: string): string | null {
  const needed = detectUsedRouterSymbols(content);
  if (needed.length === 0) return null;

  const lines = content.split("\n");
  let routerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/from\s+['"]react-router-dom['"]/.test(lines[i]!)) {
      routerLineIdx = i;
      break;
    }
  }

  const sorted = [...new Set(needed)].sort();
  if (routerLineIdx >= 0) {
    const line = lines[routerLineIdx]!;
    const existing = parseNamedImports(line);
    const merged = [...new Set([...existing, ...sorted])].sort();
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    const nextLine = `${indent}import { ${merged.join(", ")} } from "react-router-dom";`;
    if (nextLine === line) return null;
    lines[routerLineIdx] = nextLine;
    return lines.join("\n");
  }

  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i]!)) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, `import { ${sorted.join(", ")} } from "react-router-dom";`);
  return lines.join("\n");
}

/** Wrap bare JSON.parse(localStorage.getItem(...)) with try/catch fallback. */
export function fixLocalStorageParseFallback(content: string): string | null {
  const re =
    /(\s*)(const|let)\s+(\w+)\s*=\s*JSON\.parse\(\s*localStorage\.getItem\(([^)]+)\)\s*(?:\?\?\s*['"][^'"]*['"])?\s*\)\s*;/g;
  let changed = false;
  const next = content.replace(re, (match, indent, _kw, varName, keyExpr) => {
    if (content.includes(`try {`) && content.includes(varName)) return match;
    changed = true;
    return [
      `${indent}let ${varName}: unknown = null;`,
      `${indent}try {`,
      `${indent}  const raw = localStorage.getItem(${keyExpr});`,
      `${indent}  ${varName} = raw ? JSON.parse(raw) : null;`,
      `${indent}} catch {`,
      `${indent}  ${varName} = null;`,
      `${indent}}`,
    ].join("\n");
  });
  return changed ? next : null;
}

/** File-level greenfield fixes applied before per-diagnostic repairs. */
export function applyGreenfieldFileLevelFixes(
  relPath: string,
  content: string,
): { content: string; fixes: string[] } | null {
  const fixes: string[] = [];
  let next = content;
  const normalizedPath = relPath.replace(/\\/g, "/");

  if (normalizedPath.endsWith("src/components/IconStub.tsx")) {
    const cleaned = repairInvalidIconStubExports(next);
    if (cleaned) {
      next = cleaned;
      fixes.push("removed invalid IconStub exports");
    }
    const upgraded = upgradeIconStubModule(next);
    if (upgraded) {
      next = upgraded;
      fixes.push("upgraded IconStub to accept size props");
    }
  }

  if (normalizedPath.endsWith("src/components/Layout.tsx")) {
    const layoutExport = normalizeNamedComponentExport(next, "Layout");
    if (layoutExport && layoutExport !== next) {
      next = layoutExport;
      fixes.push("normalized Layout named export");
    }
    const malformed = fixMalformedOptionalProps(next);
    if (malformed) {
      next = malformed;
      fixes.push("fixed malformed optional Layout props");
    }
    const relaxed = relaxLayoutPropsInterfaces(next);
    if (relaxed) {
      next = relaxed;
      fixes.push("relaxed LayoutProps optional fields");
    } else if (!/children\?\s*:/.test(next) && /children\s*:/.test(next)) {
      next = next.replace(/children\s*:\s*React\.ReactNode/g, "children?: React.ReactNode");
      fixes.push("made Layout children prop optional");
    }
    if (!/<Outlet[\s/>]/.test(next)) {
      const router = ensureReactRouterImports(next);
      if (router) next = router;
      if (!/children\s*\?\?\s*<Outlet\s*\/>/.test(next) && /\{children\}/.test(next)) {
        next = next.replace(/\{children\}/, "{children ?? <Outlet />}");
        fixes.push("added Outlet fallback for nested routes");
      }
    }
  }

  if (normalizedPath.endsWith("Sidebar.tsx")) {
    const collision = repairIconRouterSymbolCollisions(next);
    if (collision) {
      next = collision;
      fixes.push("aliased icon imports that collide with react-router");
    }
    const localExport = repairIconLocalExportNameCollisions(next);
    if (localExport) {
      next = localExport;
      fixes.push("aliased icon imports that collide with page export name");
    }
    const sidebarExport = normalizeNamedComponentExport(next, "Sidebar");
    if (sidebarExport && sidebarExport !== next) {
      next = sidebarExport;
      fixes.push("normalized Sidebar named export");
    }
  }

  if (normalizedPath.endsWith("src/components/Layout.tsx")) {
    const sidebarFix = next.replace(
      /import\s+Sidebar\s+from\s+(['"]\.\/Sidebar['"]);?/g,
      'import { Sidebar } from "./Sidebar";',
    );
    if (sidebarFix !== next) {
      next = sidebarFix;
      fixes.push("fixed Sidebar named import");
    }
  }

  if (normalizedPath.endsWith("src/App.tsx")) {
    const corrupted = fixCorruptedLayoutElementProps(next);
    if (corrupted) {
      next = corrupted;
      fixes.push("fixed corrupted Layout route element");
    }
    const sanitized = sanitizeAppIntegration(next);
    if (sanitized && sanitized !== next) {
      next = sanitized;
      fixes.push("removed nested BrowserRouter from App.tsx");
    }
  }

  const router = ensureReactRouterImports(next);
  if (router) {
    next = router;
    fixes.push("ensured react-router-dom imports");
  }

  const storage = fixLocalStorageParseFallback(next);
  if (storage) {
    next = storage;
    fixes.push("added localStorage JSON.parse fallback");
  }

  const syntax = applySyntaxCorruptionRepairs(next);
  if (syntax) {
    next = syntax;
    fixes.push("repaired corrupted record literal");
  }

  const alignedState = shouldAlignUseStateWithRelaxedMock(normalizedPath)
    ? alignUseStateWithRelaxedMock(next)
    : null;
  if (alignedState) {
    next = alignedState;
    fixes.push("aligned useState with relaxed mock array");
  }

  const statusField = repairMisplacedStatusInDateField(next);
  if (statusField) {
    next = statusField;
    fixes.push("fixed misplaced status in date field");
  }

  const scalarArrays = wrapAllScalarArrayProperties(next);
  if (scalarArrays) {
    next = scalarArrays;
    fixes.push("wrapped scalar mock fields as arrays");
  }

  const docUrls = completeMockDocumentUrls(next);
  if (docUrls) {
    next = docUrls;
    fixes.push("completed mock document urls");
  }

  const scheduleTimes = completeMockScheduleItemTimes(next);
  if (scheduleTimes) {
    next = scheduleTimes;
    fixes.push("completed mock schedule item times");
  }

  const docTypes = mapInvalidDocumentTypeLiterals(next);
  if (docTypes) {
    next = docTypes;
    fixes.push("mapped invalid document type literals");
  }

  const statusFallbacks = addStatusFallbackForBadgeProps(next);
  if (statusFallbacks) {
    next = statusFallbacks;
    fixes.push("added status prop fallbacks");
  }

  const collapsedUrl = collapseRepeatedPropertyLines(next, "url");
  if (collapsedUrl) {
    next = collapsedUrl;
    fixes.push("collapsed duplicate url properties");
  }

  const docMock = repairBrokenDocumentMockArray(next);
  if (docMock) {
    next = docMock;
    fixes.push("repaired broken document mock array");
  }

  const relaxedRecord = relaxExhaustiveRecordAnnotation(next);
  if (relaxedRecord) {
    next = relaxedRecord;
    fixes.push("relaxed exhaustive Record annotation");
  }

  if (normalizedPath.endsWith("src/types.ts")) {
    const cleaned = cleanCorruptedTypeDefinitions(next);
    if (cleaned) {
      next = cleaned;
      fixes.push("cleaned corrupted type definitions");
    }
    const enrollment = augmentStudentEnrollmentStatus(next);
    if (enrollment) {
      next = enrollment;
      fixes.push("added Student.enrollmentStatus field");
    }
  }

  if (fixes.length === 0 || next === content) return null;
  return { content: next, fixes };
}
