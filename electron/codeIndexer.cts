/**
 * Lightweight, dependency-free code indexer.
 *
 * Uses conservative regular expressions to extract imports, exports, function
 * names, and React component names from JS/TS source. This is intentionally NOT
 * a full parser — it is a fast, best-effort index for navigation and search.
 * It performs no evaluation and never executes any project code.
 */

export type IndexedSymbolKind =
  | "component"
  | "function"
  | "export"
  | "hook"
  | "class"
  | "interface"
  | "type";

export interface SymbolLocation {
  name: string;
  kind: IndexedSymbolKind;
  line: number;
}

export interface FileIndex {
  path: string;
  imports: string[];
  exports: string[];
  components: string[];
  functions: string[];
  hooks: string[];
  classes: string[];
  interfaces: string[];
  types: string[];
  /** Identifier names referenced in this file (for cross-file symbol graph). */
  referencedNames: string[];
  /** Symbols with source line numbers (Phase 20). */
  symbolLocations: SymbolLocation[];
}

const INDEXABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const JSX_EXTENSIONS = new Set([".tsx", ".jsx"]);

export function isIndexable(extension: string): boolean {
  return INDEXABLE_EXTENSIONS.has(extension.toLowerCase());
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function matchAll(source: string, pattern: RegExp): RegExpMatchArray[] {
  return [...source.matchAll(pattern)];
}

function collectNamedMatches(
  source: string,
  pattern: RegExp,
): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  for (const m of matchAll(source, pattern)) {
    if (!m[1] || m.index === undefined) continue;
    out.push({ name: m[1], line: lineNumberAt(source, m.index) });
  }
  return out;
}

function extractImports(source: string): string[] {
  const specs: string[] = [];
  for (const m of matchAll(
    source,
    /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
  )) {
    if (m[1]) specs.push(m[1]);
  }
  for (const m of matchAll(source, /require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1]) specs.push(m[1]);
  }
  for (const m of matchAll(source, /import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1]) specs.push(m[1]);
  }
  return unique(specs);
}

function extractExports(source: string): { names: string[]; locations: SymbolLocation[] } {
  const locations: SymbolLocation[] = [];
  const names: string[] = [];

  const push = (name: string, line: number) => {
    names.push(name);
    locations.push({ name, kind: "export", line });
  };

  for (const m of collectNamedMatches(
    source,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
  )) {
    push(m.name, m.line);
  }
  for (const m of collectNamedMatches(
    source,
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
  )) {
    push(m.name, m.line);
  }
  for (const m of collectNamedMatches(source, /export\s+class\s+([A-Za-z0-9_$]+)/g)) {
    push(m.name, m.line);
  }
  for (const m of collectNamedMatches(
    source,
    /export\s+(?:interface|type)\s+([A-Za-z0-9_$]+)/g,
  )) {
    push(m.name, m.line);
  }
  for (const m of matchAll(source, /export\s*\{([^}]+)\}/g)) {
    const group = m[1];
    if (!group || m.index === undefined) continue;
    const line = lineNumberAt(source, m.index);
    for (const raw of group.split(",")) {
      const part = raw.trim();
      if (!part || part === "type") continue;
      const cleaned = part.replace(/^type\s+/, "");
      const aliasMatch = cleaned.match(/\sas\s+([A-Za-z0-9_$]+)/);
      const name = aliasMatch ? aliasMatch[1]! : cleaned.split(/\s+/)[0];
      if (name && /^[A-Za-z0-9_$]+$/.test(name)) push(name, line);
    }
  }
  if (/export\s+default\b/.test(source)) {
    const m = /export\s+default\b/.exec(source);
    push("default", m?.index !== undefined ? lineNumberAt(source, m.index) : 1);
  }

  return { names: unique(names), locations };
}

function extractFunctionNames(source: string): { names: string[]; locations: SymbolLocation[] } {
  const locations: SymbolLocation[] = [];
  for (const m of collectNamedMatches(source, /\bfunction\s+([A-Za-z0-9_$]+)/g)) {
    locations.push({ name: m.name, kind: "function", line: m.line });
  }
  for (const m of collectNamedMatches(
    source,
    /\b(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/g,
  )) {
    locations.push({ name: m.name, kind: "function", line: m.line });
  }
  const names = unique(locations.map((l) => l.name));
  return { names, locations };
}

function extractHooks(source: string): { names: string[]; locations: SymbolLocation[] } {
  const locations: SymbolLocation[] = [];
  for (const m of collectNamedMatches(
    source,
    /\b(?:const|let|var)\s+(use[A-Z][A-Za-z0-9_$]*)\s*=/g,
  )) {
    locations.push({ name: m.name, kind: "hook", line: m.line });
  }
  for (const m of collectNamedMatches(
    source,
    /\bfunction\s+(use[A-Z][A-Za-z0-9_$]*)\s*\(/g,
  )) {
    locations.push({ name: m.name, kind: "hook", line: m.line });
  }
  return { names: unique(locations.map((l) => l.name)), locations };
}

function extractClasses(source: string): { names: string[]; locations: SymbolLocation[] } {
  const locations: SymbolLocation[] = [];
  for (const m of collectNamedMatches(source, /\bclass\s+([A-Za-z0-9_$]+)/g)) {
    locations.push({ name: m.name, kind: "class", line: m.line });
  }
  return { names: unique(locations.map((l) => l.name)), locations };
}

function extractInterfaces(source: string): { names: string[]; locations: SymbolLocation[] } {
  const locations: SymbolLocation[] = [];
  for (const m of collectNamedMatches(source, /\binterface\s+([A-Za-z0-9_$]+)/g)) {
    locations.push({ name: m.name, kind: "interface", line: m.line });
  }
  return { names: unique(locations.map((l) => l.name)), locations };
}

function extractTypeAliases(source: string): { names: string[]; locations: SymbolLocation[] } {
  const locations: SymbolLocation[] = [];
  for (const m of collectNamedMatches(source, /\btype\s+([A-Za-z0-9_$]+)\s*=/g)) {
    locations.push({ name: m.name, kind: "type", line: m.line });
  }
  return { names: unique(locations.map((l) => l.name)), locations };
}

function extractReferencedNames(source: string, jsx: boolean): string[] {
  const names: string[] = [];

  for (const m of matchAll(source, /import\s+(?:type\s+)?\{([^}]+)\}/g)) {
    const group = m[1];
    if (!group) continue;
    for (const raw of group.split(",")) {
      const part = raw.trim().replace(/^type\s+/, "");
      const alias = part.match(/\sas\s+([A-Za-z0-9_$]+)/);
      const name = alias ? alias[1] : part.split(/\s+/)[0];
      if (name && /^[A-Za-z0-9_$]+$/.test(name)) names.push(name);
    }
  }

  for (const m of matchAll(source, /import\s+([A-Za-z0-9_$]+)\s+from/g)) {
    if (m[1]) names.push(m[1]);
  }

  if (jsx) {
    for (const m of matchAll(source, /<([A-Z][A-Za-z0-9_$]*)/g)) {
      if (m[1]) names.push(m[1]);
    }
  }

  for (const m of matchAll(source, /\b(use[A-Z][A-Za-z0-9_$]*)\s*\(/g)) {
    if (m[1]) names.push(m[1]);
  }

  for (const m of matchAll(source, /\b([A-Z][A-Za-z0-9_$]{2,})\b/g)) {
    if (m[1] && !["React", "Fragment", "StrictMode"].includes(m[1])) {
      names.push(m[1]);
    }
  }

  return unique(names);
}

function startsUppercase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function dedupeLocations(locations: SymbolLocation[]): SymbolLocation[] {
  const seen = new Set<string>();
  const out: SymbolLocation[] = [];
  for (const loc of locations) {
    const key = `${loc.kind}::${loc.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}

/** Index a single source file's text. `path` is the project-relative path. */
export function indexFile(
  path: string,
  extension: string,
  source: string,
): FileIndex {
  const imports = extractImports(source);
  const exportData = extractExports(source);
  const functionData = extractFunctionNames(source);
  const hookData = extractHooks(source);
  const classData = extractClasses(source);
  const interfaceData = extractInterfaces(source);
  const typeData = extractTypeAliases(source);

  const jsx = JSX_EXTENSIONS.has(extension.toLowerCase());
  const components: string[] = [];
  const functions: string[] = [];
  const symbolLocations: SymbolLocation[] = [
    ...exportData.locations,
    ...hookData.locations,
    ...classData.locations,
    ...interfaceData.locations,
    ...typeData.locations,
  ];

  for (const loc of functionData.locations) {
    if (jsx && startsUppercase(loc.name) && !loc.name.startsWith("use")) {
      components.push(loc.name);
      symbolLocations.push({ name: loc.name, kind: "component", line: loc.line });
    } else if (!loc.name.startsWith("use")) {
      functions.push(loc.name);
      symbolLocations.push(loc);
    }
  }

  for (const name of classData.names) {
    if (!components.includes(name)) {
      components.push(name);
    }
  }

  const referencedNames = extractReferencedNames(source, jsx);

  return {
    path,
    imports,
    exports: exportData.names,
    components: unique(components),
    functions: unique(functions),
    hooks: hookData.names,
    classes: classData.names,
    interfaces: interfaceData.names,
    types: typeData.names,
    referencedNames,
    symbolLocations: dedupeLocations(symbolLocations),
  };
}
