/** Replace lucide-react / heroicons / react-icons with a local stub module. */

const ICON_LIBRARY_RE =
  /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](lucide-react|@heroicons\/react(?:\/[^'"]+)?|react-icons\/[^'"]+)['"];?\s*\r?\n?/g;

export function projectSourcesReferenceIconLibraries(
  files: ReadonlyMap<string, string>,
): boolean {
  for (const content of files.values()) {
    if (/from\s+['"]lucide-react['"]/.test(content)) return true;
    if (/from\s+['"]@heroicons\/react/.test(content)) return true;
    if (/from\s+['"]react-icons\//.test(content)) return true;
  }
  return false;
}

function parseNamedImports(imports: string): string[] {
  return imports
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0]!.trim())
    .filter(Boolean);
}

function isIconLibrary(moduleName: string): boolean {
  return (
    moduleName === "lucide-react" ||
    moduleName.startsWith("@heroicons/react") ||
    moduleName.startsWith("react-icons/")
  );
}

const INVALID_ICON_SYMBOLS = new Set([
  "LucideProps",
  "LucideIcon",
  "IconProps",
  "ForwardRefExoticComponent",
  "RefAttributes",
]);

function isValidIconSymbol(name: string): boolean {
  if (INVALID_ICON_SYMBOLS.has(name)) return false;
  if (name.includes(".") || name.includes("<")) return false;
  if (/Props$/.test(name)) return false;
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

export function buildIconStubModule(symbols: readonly string[]): string {
  const unique = [...new Set(symbols.filter(isValidIconSymbol))].sort();
  const lines = [
    'import type { FC, SVGProps } from "react";',
    "type IconStubProps = SVGProps<SVGSVGElement> & {",
    "  size?: number | string;",
    "  strokeWidth?: number;",
    "  className?: string;",
    "};",
    "const IconStub: FC<IconStubProps> = () => (",
    '  <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />',
    ");",
  ];
  for (const sym of unique) {
    lines.push(`export const ${sym} = IconStub;`);
  }
  return `${lines.join("\n")}\n`;
}

function relativeImportPath(fromFile: string, stubPath: string): string {
  const fromDir = fromFile.replace(/\\/g, "/").replace(/\/[^/]+$/, "") || ".";
  const stub = stubPath.replace(/\\/g, "/").replace(/\.tsx?$/, "");
  const fromParts = fromDir === "." ? [] : fromDir.split("/");
  const stubParts = stub.split("/");
  let common = 0;
  while (
    common < fromParts.length &&
    common < stubParts.length &&
    fromParts[common] === stubParts[common]
  ) {
    common += 1;
  }
  const up = fromParts.length - common;
  const down = stubParts.slice(common);
  const rel = [...Array(up).fill(".."), ...down].join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** Rewrite icon library imports in one file to use the project stub module. */
export function rewriteIconImportInFile(
  content: string,
  relPath: string,
  stubRelPath = "src/components/IconStub.tsx",
): { content: string; symbols: string[] } | null {
  const symbols: string[] = [];
  let changed = false;

  const next = content.replace(ICON_LIBRARY_RE, (match, imports: string, moduleName: string) => {
    if (!isIconLibrary(moduleName)) return match;
    symbols.push(...parseNamedImports(imports));
    changed = true;
    const importPath = relativeImportPath(relPath, stubRelPath);
    const names = parseNamedImports(imports).join(", ");
    return `import { ${names} } from "${importPath}";\n`;
  });

  if (!changed) return null;
  return { content: next, symbols };
}

export interface ProjectIconRepairResult {
  readonly files: ReadonlyMap<string, string>;
  readonly changed: boolean;
  readonly stubWritten: boolean;
}

/** Scan project sources, write IconStub.tsx, rewrite all icon library imports. */
export function repairIconLibrariesInProject(
  files: ReadonlyMap<string, string>,
  stubPath = "src/components/IconStub.tsx",
): ProjectIconRepairResult {
  const original = files;
  const updated = new Map(files);
  let changed = false;

  for (const [path, content] of files) {
    if (!/\.tsx?$/.test(path)) continue;
    const localExport = repairIconLocalExportNameCollisions(content);
    if (localExport) {
      updated.set(path, localExport);
      changed = true;
      continue;
    }
    const collision = repairIconRouterSymbolCollisions(content);
    if (collision) {
      updated.set(path, collision);
      changed = true;
    }
  }

  for (const [path, content] of updated) {
    if (!/\.tsx?$/.test(path)) continue;
    const rewritten = rewriteIconImportInFile(content, path, stubPath);
    if (!rewritten) continue;
    updated.set(path, rewritten.content);
    changed = true;
  }

  const allSymbols = applyRouterCollisionStubSymbols(collectIconStubImportSymbols(updated));
  const augmented = augmentIconStubFromProjectImports(updated, stubPath);
  if (augmented.changed) {
    const augmentedSymbols = applyRouterCollisionStubSymbols(
      collectIconStubImportSymbols(augmented.files),
    );
    const merged = new Map(augmented.files);
    merged.set(stubPath, buildIconStubModule([...augmentedSymbols]));
    return finalizeIconLibraryRepair(merged, stubPath, original);
  }

  if (!changed) {
    return { files, changed: false, stubWritten: false };
  }

  if (allSymbols.size > 0) {
    updated.set(stubPath, buildIconStubModule([...allSymbols]));
    return finalizeIconLibraryRepair(updated, stubPath, original);
  }

  return finalizeIconLibraryRepair(updated, stubPath, original);
}

function finalizeIconLibraryRepair(
  files: ReadonlyMap<string, string>,
  stubPath: string,
  original: ReadonlyMap<string, string>,
): ProjectIconRepairResult {
  const merged = new Map(files);
  let changed = false;
  for (const [path, content] of files) {
    if (!/\.tsx?$/.test(path)) continue;
    if (!/react-router-dom/.test(content) || !/IconStub/.test(content)) continue;
    const collision = repairIconRouterSymbolCollisions(content);
    if (!collision || collision === content) continue;
    merged.set(path, collision);
    changed = true;
  }
  const stubWritten =
    merged.has(stubPath) && merged.get(stubPath) !== original.get(stubPath);
  const filesChanged = [...merged.entries()].some(
    ([path, content]) => content !== original.get(path),
  );
  return {
    files: merged,
    changed: changed || stubWritten || filesChanged,
    stubWritten,
  };
}

export function repairInvalidIconStubExports(content: string): string | null {
  if (!/IconStub/.test(content)) return null;
  const next = content.replace(
    /^export const (?:LucideProps|React\.[^\n=]+) = IconStub;\n/gm,
    "",
  );
  return next === content ? null : next;
}

/** Upgrade legacy IconStub modules to the current prop-safe implementation. */
export function upgradeIconStubModule(content: string): string | null {
  if (!/IconStub/.test(content)) return null;
  const invalid = repairInvalidIconStubExports(content);
  if (invalid) content = invalid;
  if (
    !/_props/.test(content) &&
    !/className\]\.filter/.test(content) &&
    /strokeWidth\?\s*:/.test(content) &&
    /const IconStub: FC<IconStubProps> = \(\) =>/.test(content)
  ) {
    return null;
  }
  const symbols = [...content.matchAll(/export const (\w+) = IconStub/g)]
    .map((m) => m[1]!)
    .filter(isValidIconSymbol);
  if (symbols.length === 0) return null;
  const upgraded = buildIconStubModule(symbols);
  return upgraded === content ? null : upgraded;
}

/** Strip icon JSX when stub rewrite is not enough (legacy path). */
export function stripUnsupportedIconImports(content: string, moduleName: string): string | null {
  if (!isIconLibrary(moduleName)) return null;
  const rewritten = rewriteIconImportInFile(content, "src/pages/Unknown.tsx");
  return rewritten?.content ?? null;
}

function findIconStubImports(content: string): Array<{ full: string; imports: string }> {
  const results: Array<{ full: string; imports: string }> = [];
  const endRe = /\}\s+from\s+['"][^'"]*IconStub['"]/g;
  for (const endMatch of content.matchAll(endRe)) {
    const closeBraceIdx = endMatch.index!;
    const endIdx = closeBraceIdx + endMatch[0].length;
    const openIdx = content.lastIndexOf("import {", closeBraceIdx);
    if (openIdx < 0) continue;
    const braceIdx = content.indexOf("{", openIdx);
    if (braceIdx < 0 || braceIdx > closeBraceIdx) continue;
    results.push({
      full: content.slice(openIdx, endIdx),
      imports: content.slice(braceIdx + 1, closeBraceIdx),
    });
  }
  return results;
}

function findIconStubImport(content: string): { full: string; imports: string } | null {
  return findIconStubImports(content)[0] ?? null;
}

export { findIconStubImport, parseImportSymbolName };

const ROUTER_ICON_COLLISIONS = new Set([
  "Route",
  "Link",
  "NavLink",
  "Outlet",
  "Navigate",
]);

function applyRouterCollisionStubSymbols(symbols: Set<string>): Set<string> {
  const next = new Set(symbols);
  for (const collision of ROUTER_ICON_COLLISIONS) {
    if (!next.has(collision)) continue;
    next.delete(collision);
    next.add(`${collision}Icon`);
  }
  return next;
}

function parseImportSymbolName(part: string): string {
  const trimmed = part.trim();
  const segments = trimmed.split(/\s+as\s+/);
  return (segments[0] ?? "").trim();
}

function collectSymbolsFromImportPart(part: string): string[] {
  const source = parseImportSymbolName(part);
  return isValidIconSymbol(source) ? [source] : [];
}

/** Collect icon component names imported from IconStub across the project. */
export function collectIconStubImportSymbols(
  files: ReadonlyMap<string, string>,
): Set<string> {
  const symbols = new Set<string>();
  for (const content of files.values()) {
    for (const stubImport of findIconStubImports(content)) {
      for (const part of stubImport.imports.split(",")) {
        for (const name of collectSymbolsFromImportPart(part)) {
          symbols.add(name);
        }
      }
    }
  }
  return symbols;
}

/** Add missing IconStub exports for symbols already imported from the stub module. */
export function augmentIconStubFromProjectImports(
  files: ReadonlyMap<string, string>,
  stubPath = "src/components/IconStub.tsx",
): ProjectIconRepairResult {
  const requested = collectIconStubImportSymbols(files);
  const existing = new Set<string>();
  const stubContent = files.get(stubPath);
  if (stubContent) {
    for (const match of stubContent.matchAll(/export const (\w+) = IconStub/g)) {
      if (isValidIconSymbol(match[1]!)) existing.add(match[1]!);
    }
  }

  const missing = [...requested].filter((sym) => !existing.has(sym));
  if (missing.length === 0) return { files, changed: false, stubWritten: false };

  const allSymbols = applyRouterCollisionStubSymbols(new Set([...existing, ...requested]));
  const updated = new Map(files);
  updated.set(stubPath, buildIconStubModule([...allSymbols]));
  return { files: updated, changed: true, stubWritten: true };
}

/** Alias icon imports that collide with react-router-dom named exports (e.g. Route). */
export function repairIconRouterSymbolCollisions(content: string): string | null {
  const routerMatch = content.match(
    /import\s+\{([^}]+)\}\s+from\s+['"]react-router-dom['"]/,
  );
  const stubMatch = findIconStubImport(content);
  if (!routerMatch || !stubMatch) return null;

  const routerSymbols = new Set(
    routerMatch[1]!.split(",").map((part) => parseImportSymbolName(part)),
  );
  const stubParts = stubMatch.imports
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const conflicts = stubParts
    .map((part) => ({ raw: part, name: parseImportSymbolName(part) }))
    .filter((entry) => ROUTER_ICON_COLLISIONS.has(entry.name) && routerSymbols.has(entry.name));

  if (conflicts.length === 0) return null;

  let next = content;
  const stubImport = stubMatch.full;
  let nextStubImport = stubImport;

  for (const { raw, name } of conflicts) {
    const alias = `${name}Icon`;
    const replacement = raw.includes(" as ") ? alias : alias;
    nextStubImport = nextStubImport.replace(
      new RegExp(`(^|\\s|,|\\{)\\s*${escapeRegExp(raw)}\\b`),
      `$1${replacement}`,
    );
    next = next.replace(new RegExp(`\\bicon:\\s*${escapeRegExp(name)}\\b`, "g"), `icon: ${alias}`);
    next = next.replace(
      new RegExp(`<${escapeRegExp(name)}(\\s|/>)`, "g"),
      `<${alias}$1`,
    );
    next = next.replace(new RegExp(`</${escapeRegExp(name)}>`, "g"), `</${alias}>`);
  }

  next = next.replace(stubImport, nextStubImport);

  const routerImport = routerMatch[0]!;
  const remainingRouterParts = routerMatch[1]!
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const name = parseImportSymbolName(part);
      if (!ROUTER_ICON_COLLISIONS.has(name)) return true;
      return conflicts.every((conflict) => conflict.name !== name);
    });
  if (remainingRouterParts.length !== routerMatch[1]!.split(",").filter((p) => p.trim()).length) {
    const nextRouterImport =
      remainingRouterParts.length > 0
        ? `import { ${remainingRouterParts.join(", ")} } from "react-router-dom";`
        : "";
    next = next.replace(routerImport, nextRouterImport);
  }

  return next === content ? null : next;
}

/** Alias IconStub imports that share a name with the page's default export (e.g. Settings). */
export function repairIconLocalExportNameCollisions(content: string): string | null {
  const stubImport = findIconStubImport(content);
  if (!stubImport) return null;
  const localName = content.match(/export\s+default\s+function\s+(\w+)/)?.[1];
  if (!localName || !isValidIconSymbol(localName)) return null;

  const stubParts = stubImport.imports
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const conflict = stubParts.find((part) => parseImportSymbolName(part) === localName);
  if (!conflict) return null;

  const alias = `${localName}Icon`;
  const replacement = conflict.includes(" as ") ? alias : alias;
  let nextStubImport = stubImport.full.replace(
    new RegExp(`(^|\\s|,|\\{)\\s*${escapeRegExp(conflict)}\\b`),
    `$1${replacement}`,
  );
  let next = content.replace(stubImport.full, nextStubImport);
  next = next.replace(new RegExp(`\\bicon:\\s*${escapeRegExp(localName)}\\b`, "g"), `icon: ${alias}`);
  next = next.replace(new RegExp(`<${escapeRegExp(localName)}(\\s|/>)`, "g"), `<${alias}$1`);
  return next === content ? null : next;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
