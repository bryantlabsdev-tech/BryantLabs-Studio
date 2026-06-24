import type { GreenfieldManifest, GreenfieldPageSpec } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFile, GreenfieldProjectFilePath } from "@/core/greenfield/types";

export interface DomainConsistencyReport {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly expectedPageTitles: readonly string[];
  readonly expectedPagePaths: readonly GreenfieldProjectFilePath[];
  readonly missingPagePaths: readonly string[];
  readonly unexpectedPagePaths: readonly string[];
  readonly appRouteMismatches: readonly string[];
  readonly sidebarMismatches: readonly string[];
  readonly typeExportMismatches: readonly string[];
}

const FIELDFLOW_PAGE_TITLES = new Set([
  "Dashboard",
  "Leads",
  "Jobs",
  "Estimates",
  "Invoices",
  "Customers",
  "Settings",
]);

function componentName(title: string): string {
  return title.replace(/\s+/g, "");
}

function fileForPage(page: GreenfieldPageSpec): GreenfieldProjectFilePath {
  return page.path;
}

function pageFiles(
  projectFiles: readonly GreenfieldProjectFile[],
): GreenfieldProjectFile[] {
  return projectFiles.filter(
    (f) => f.path.startsWith("src/pages/") && f.path.endsWith(".tsx"),
  );
}

function readFile(
  projectFiles: readonly GreenfieldProjectFile[],
  path: string,
): string | null {
  return projectFiles.find((f) => f.path === path)?.content ?? null;
}

export function extractTypeImportsFromPage(content: string): string[] {
  const imports: string[] = [];
  const re = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]\.\.\/types['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) imports.push(name);
    }
  }
  return imports;
}

export function extractExportedTypeNames(typesContent: string): Set<string> {
  const names = new Set<string>();
  const patterns = [
    /export\s+type\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /export\s+interface\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /export\s+enum\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /export\s+const\s+([A-Z][A-Z0-9_]*)\s*=/g,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(typesContent)) !== null) {
      if (match[1]) names.add(match[1]);
    }
  }
  return names;
}

function extractAppPageImports(appContent: string): string[] {
  const imports: string[] = [];
  const re = /import\s+([A-Za-z][A-Za-z0-9_]*)\s+from\s+['"]\.\/pages\/([A-Za-z][A-Za-z0-9_]*)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(appContent)) !== null) {
    if (match[1]) imports.push(match[1]);
  }
  return imports;
}

function manifestUsesFieldFlowPages(manifest: GreenfieldManifest): boolean {
  const titles = new Set(manifest.pages.map((p) => p.title));
  return (
    /fieldflow/i.test(manifest.appName) &&
    ["Leads", "Jobs", "Estimates"].every((t) => titles.has(t))
  );
}

/** Fail when generated artifacts drift from the planned manifest / prompt domain. */
export function validateDomainConsistency(
  manifest: GreenfieldManifest,
  projectFiles: readonly GreenfieldProjectFile[],
): DomainConsistencyReport {
  const errors: string[] = [];
  const expectedPageTitles = manifest.pages.map((p) => p.title);
  const expectedPagePaths = manifest.pagePaths;
  const expectedPathSet = new Set(expectedPagePaths);

  const missingPagePaths = expectedPagePaths.filter(
    (path) => !projectFiles.some((f) => f.path === path && f.content.trim()),
  );
  if (missingPagePaths.length > 0) {
    errors.push(`Missing manifest page files: ${missingPagePaths.join(", ")}`);
  }

  const unexpectedPagePaths = pageFiles(projectFiles)
    .map((f) => f.path)
    .filter((path) => !expectedPathSet.has(path as GreenfieldProjectFilePath));
  if (unexpectedPagePaths.length > 0) {
    errors.push(
      `Unexpected page files not in manifest: ${unexpectedPagePaths.join(", ")}`,
    );
  }

  const fieldFlowDrift = unexpectedPagePaths
    .concat(missingPagePaths)
    .some((p) => /Leads|Jobs|Estimates|Invoices|Customers/.test(p));
  if (fieldFlowDrift && !manifestUsesFieldFlowPages(manifest)) {
    errors.push(
      "FieldFlow CRM page names detected but manifest is not FieldFlow — domain drift.",
    );
  }

  const appContent = readFile(projectFiles, "src/App.tsx");
  const appRouteMismatches: string[] = [];
  if (appContent) {
    const expectedComponents = new Set(
      manifest.pages.map((p) => componentName(p.title)),
    );
    const imported = extractAppPageImports(appContent);
    for (const comp of imported) {
      if (!expectedComponents.has(comp)) {
        appRouteMismatches.push(comp);
      }
    }
    for (const page of manifest.pages) {
      const comp = componentName(page.title);
      if (!imported.includes(comp) && !appContent.includes(`<${comp}`)) {
        appRouteMismatches.push(`missing:${comp}`);
      }
    }
    if (appRouteMismatches.length > 0) {
      errors.push(
        `App.tsx routes/imports do not match manifest: ${appRouteMismatches.join(", ")}`,
      );
    }
  } else {
    errors.push("App.tsx missing for domain consistency check.");
  }

  const sidebarContent = readFile(projectFiles, "src/components/Sidebar.tsx");
  const sidebarMismatches: string[] = [];
  if (sidebarContent) {
    for (const page of manifest.pages) {
      const comp = componentName(page.title);
      const titlePresent = sidebarContent.includes(page.title);
      const routePresent =
        page.route === "/"
          ? sidebarContent.includes('to="/"') || sidebarContent.includes("to='/'")
          : sidebarContent.includes(page.route) ||
            sidebarContent.includes(page.route.slice(1));
      const compPresent = sidebarContent.includes(comp);
      if (!titlePresent && !routePresent && !compPresent) {
        sidebarMismatches.push(page.title);
      }
    }
    if (sidebarMismatches.length > 0) {
      errors.push(
        `Sidebar missing nav for: ${sidebarMismatches.join(", ")}`,
      );
    }
  }

  const typesContent = readFile(projectFiles, "src/types.ts");
  const typeExportMismatches: string[] = [];
  if (typesContent) {
    const exported = extractExportedTypeNames(typesContent);
    for (const page of pageFiles(projectFiles)) {
      if (!expectedPathSet.has(page.path as GreenfieldProjectFilePath)) continue;
      for (const typeName of extractTypeImportsFromPage(page.content)) {
        if (!exported.has(typeName)) {
          typeExportMismatches.push(`${typeName} (used in ${page.path})`);
        }
      }
    }
    if (typeExportMismatches.length > 0) {
      errors.push(
        `types.ts missing exports: ${typeExportMismatches.join(", ")}`,
      );
    }

    if (!manifestUsesFieldFlowPages(manifest)) {
      for (const legacy of ["Lead", "Job", "Estimate", "Invoice", "Customer"]) {
        if (
          exported.has(legacy) &&
          !manifest.pages.some((p) =>
            p.title.toLowerCase().startsWith(legacy.toLowerCase()),
          )
        ) {
          typeExportMismatches.push(`legacy FieldFlow type: ${legacy}`);
          errors.push(
            `types.ts exports FieldFlow type "${legacy}" but manifest is ${manifest.appName}.`,
          );
        }
      }
    }
  } else if (manifest.sharedPaths.includes("src/types.ts")) {
    errors.push("src/types.ts missing for domain consistency check.");
  }

  return {
    ok: errors.length === 0,
    errors,
    expectedPageTitles,
    expectedPagePaths,
    missingPagePaths,
    unexpectedPagePaths,
    appRouteMismatches,
    sidebarMismatches,
    typeExportMismatches,
  };
}

export function isFieldFlowManifest(manifest: GreenfieldManifest): boolean {
  return manifestUsesFieldFlowPages(manifest);
}

export { FIELDFLOW_PAGE_TITLES, componentName, fileForPage };
