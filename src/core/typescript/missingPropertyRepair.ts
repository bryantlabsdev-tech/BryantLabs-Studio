import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";

export type ReadProjectFile = (relPath: string) => Promise<string | null>;

export interface MissingPropertyError {
  readonly typeName: string;
  readonly missingProps: readonly string[];
}

const MISSING_PROPS_RE =
  /missing the following properties from type ['"]([^'"]+)['"]:\s*(.+)$/i;
const TS2741_RE =
  /Property (?:'([^']+)'|"([^"]+)") is missing in type .+ but required in type ['"]([^'"]+)['"]/i;

export function parseMissingPropertyError(
  code: string,
  message: string,
): MissingPropertyError | null {
  if (code === "TS2739" || code === "TS2322" || code === "TS2741") {
    const bulk = message.match(MISSING_PROPS_RE);
    if (bulk) {
      const typeName = bulk[1]!.trim();
      const missingProps = bulk[2]!
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (typeName && missingProps.length > 0) {
        return { typeName, missingProps };
      }
    }
    if (code === "TS2741") {
      const single = message.match(TS2741_RE);
      if (single) {
        const prop = (single[1] ?? single[2] ?? "").replace(/^['"]|['"]$/g, "").trim();
        if (prop) {
          return { typeName: single[3]!.trim(), missingProps: [prop] };
        }
      }
    }
  }
  return null;
}

function normalizeRelPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function resolveRelativeImport(fromFile: string, importPath: string): string {
  const fromDir = normalizeRelPath(fromFile).replace(/\/[^/]+$/, "") || ".";
  const parts = importPath.split("/");
  const stack = fromDir === "." ? [] : fromDir.split("/");
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  let resolved = stack.join("/");
  if (!resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) {
    if (!resolved.includes(".")) resolved += ".ts";
  }
  return resolved;
}

function resolveAliasImport(importPath: string): string {
  const stripped = importPath.replace(/^@\//, "src/");
  if (!stripped.endsWith(".ts") && !stripped.endsWith(".tsx")) {
    return stripped.includes(".") ? stripped : `${stripped}.ts`;
  }
  return stripped;
}

export function resolveTypeSourcePaths(
  fileContent: string,
  filePath: string,
  typeName: string,
): string[] {
  const paths = new Set<string>();
  const importRe =
    /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

  for (const match of fileContent.matchAll(importRe)) {
    const names = match[1]!
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/)[0]!.trim())
      .filter(Boolean);
    if (!names.includes(typeName)) continue;
    const importPath = match[2]!;
    if (importPath.startsWith("@/")) {
      paths.add(resolveAliasImport(importPath));
    } else if (importPath.startsWith(".")) {
      paths.add(resolveRelativeImport(filePath, importPath));
    } else {
      paths.add(importPath);
    }
  }

  paths.add("src/types.ts");
  paths.add("src/types/index.ts");
  return [...paths];
}

function extractTypeBody(source: string, typeName: string): string | null {
  const patterns = [
    new RegExp(
      `(?:export\\s+)?interface\\s+${escapeRegExp(typeName)}\\s+extends\\s+[\\w.]+\\s*\\{([\\s\\S]*?)\\n\\}`,
      "m",
    ),
    new RegExp(
      `(?:export\\s+)?interface\\s+${escapeRegExp(typeName)}\\s*\\{([\\s\\S]*?)\\n\\}`,
      "m",
    ),
    new RegExp(
      `(?:export\\s+)?type\\s+${escapeRegExp(typeName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`,
      "m",
    ),
  ];
  for (const re of patterns) {
    const m = source.match(re);
    if (m?.[1]) return m[1]!;
  }
  return null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseTypeProperties(typeBody: string): Map<string, string> {
  const props = new Map<string, string>();
  let depth = 0;
  let current = "";
  for (const ch of typeBody) {
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
    if ((ch === ";" || ch === "\n") && depth === 0) {
      const segment = current.trim();
      if (segment && !segment.startsWith("//")) {
        const propMatch = segment.match(/^(['"]?)([\w$]+)\1\s*\??\s*:\s*(.+)$/);
        if (propMatch) {
          props.set(propMatch[2]!, propMatch[3]!.trim().replace(/,$/, ""));
        }
      }
      current = "";
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) {
    const propMatch = tail.match(/^(['"]?)([\w$]+)\1\s*\??\s*:\s*(.+)$/);
    if (propMatch) {
      props.set(propMatch[2]!, propMatch[3]!.trim().replace(/,$/, ""));
    }
  }
  return props;
}

export function defaultValueForProperty(
  propName: string,
  typeStr: string,
  typeSource?: string | null,
): string {
  const nested = stubValueForTypeRef(typeStr, typeSource ?? null);
  if (nested != null) return nested;

  const t = typeStr.trim();
  if (/\|/.test(t)) {
    const literals = [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    if (literals.length > 0) return JSON.stringify(literals[0]);
    const singleQuotes = [...t.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    if (singleQuotes.length > 0) return JSON.stringify(singleQuotes[0]);
  }
  if (/\[\]/.test(t) || /\bArray</.test(t)) return "[]";
  if (t === "string" || /^string\b/.test(t)) {
    if (propName === "emergencyContact") {
      return '{ name: "", relationship: "", phone: "" }';
    }
    if (/date|at$/i.test(propName)) {
      return 'new Date().toISOString().slice(0, 10)';
    }
    return '""';
  }
  if (t === "number" || /^number\b/.test(t)) return "0";
  if (t === "boolean" || /^boolean\b/.test(t)) return "false";
  if (t.startsWith("{") || /^Record</.test(t)) return "{}";
  return '""';
}

function parseInlineObjectType(typeStr: string): Map<string, string> | null {
  const trimmed = typeStr.trim();
  if (!trimmed.startsWith("{")) return null;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return parseTypeProperties(trimmed.slice(1, i));
      }
    }
  }
  return null;
}

function stubValueForTypeRef(typeStr: string, typeSource: string | null): string | null {
  const trimmed = typeStr.trim().replace(/\[\]$/, "").trim();
  const inlineProps = parseInlineObjectType(trimmed);
  if (inlineProps && inlineProps.size > 0) {
    const entries = [...inlineProps.entries()].map(([name, propType]) => {
      const value =
        stubValueForTypeRef(propType, typeSource) ??
        defaultValueForProperty(name, propType, typeSource);
      return `${name}: ${value}`;
    });
    return `{ ${entries.join(", ")} }`;
  }
  if (typeSource && /^[A-Z][A-Za-z0-9_]*$/.test(trimmed)) {
    const body = extractTypeBody(typeSource, trimmed);
    if (body) {
      const props = parseTypeProperties(body);
      if (props.size > 0) {
        const entries = [...props.entries()].map(([name, propType]) => {
          const value =
            stubValueForTypeRef(propType, typeSource) ??
            defaultValueForProperty(name, propType, typeSource);
          return `${name}: ${value}`;
        });
        return `{ ${entries.join(", ")} }`;
      }
    }
    if (/Status$/.test(trimmed)) return '"Active"';
    if (/Type$/.test(trimmed)) return '"General"';
  }
  if (trimmed.startsWith("{") || /^Record</.test(trimmed)) return "{}";
  return null;
}

async function loadTypeSourceContent(
  fileContent: string,
  filePath: string,
  typeName: string,
  readFile: ReadProjectFile,
): Promise<string | null> {
  const candidates = resolveTypeSourcePaths(fileContent, filePath, typeName);
  for (const candidate of candidates) {
    const source = await readFile(candidate);
    if (source && extractTypeBody(source, typeName)) return source;
  }
  return null;
}

function offsetAt(content: string, line: number, column: number): number {
  const lines = content.split("\n");
  let offset = 0;
  for (let i = 0; i < line - 1; i++) {
    offset += lines[i]!.length + 1;
  }
  return offset + Math.max(0, column - 1);
}

export function findObjectLiteralBounds(
  content: string,
  line: number,
  column: number,
): { start: number; end: number } | null {
  const backward = findObjectLiteralBoundsFromOffset(content, offsetAt(content, line, column));
  if (backward) return backward;

  const lines = content.split("\n");
  const lineText = lines[line - 1];
  if (!lineText) return null;
  const eqBrace = lineText.indexOf("= {");
  if (eqBrace >= 0) {
    const startOffset = offsetAt(content, line, eqBrace + 3);
    return findObjectLiteralBoundsFromOffset(content, startOffset);
  }
  const braceOnly = lineText.indexOf("{");
  if (braceOnly >= 0) {
    return findObjectLiteralBoundsFromOffset(content, offsetAt(content, line, braceOnly + 1));
  }
  return null;
}

function findObjectLiteralBoundsFromOffset(
  content: string,
  pos: number,
): { start: number; end: number } | null {
  let open = -1;
  for (let i = pos; i >= 0; i--) {
    if (content[i] === "{") {
      open = i;
      break;
    }
    if (content[i] === "}" || content[i] === ";") break;
  }
  if (open < 0) return null;

  let depth = 0;
  for (let i = open; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { start: open, end: i };
    }
  }
  return null;
}

function propertyIndent(objectLiteral: string): string {
  const lines = objectLiteral.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const m = line.match(/^(\s+)\S/);
    if (m) return m[1]!;
  }
  return "  ";
}

function existingPropertyNames(objectLiteral: string): Set<string> {
  const names = new Set<string>();
  for (const match of objectLiteral.matchAll(/^\s*(?:['"]([^'"]+)['"]|([\w$]+))\s*:/gm)) {
    const name = (match[1] ?? match[2] ?? "").trim();
    if (name) names.add(name);
  }
  return names;
}

export function patchObjectLiteralMissingProperties(
  content: string,
  diagnostic: TypeScriptDiagnostic,
  missing: MissingPropertyError,
  typeProps: Map<string, string> | null,
  typeSource?: string | null,
): string | null {
  const bounds = findObjectLiteralBounds(content, diagnostic.line, diagnostic.column);
  if (!bounds) return null;

  const literal = content.slice(bounds.start, bounds.end + 1);
  const present = existingPropertyNames(literal);
  const toAdd = missing.missingProps.filter((p) => !present.has(p));
  if (toAdd.length === 0) return null;

  const indent = propertyIndent(literal);
  const additions = toAdd.map((prop) => {
    const typeStr = typeProps?.get(prop) ?? "string";
    const value = defaultValueForProperty(prop, typeStr, typeSource);
    const key = /[^a-zA-Z0-9_$]/.test(prop) ? `"${prop}"` : prop;
    return `${indent}${key}: ${value},`;
  });

  const closeIdx = bounds.end;
  let prefix = content.slice(0, closeIdx).trimEnd();
  if (!prefix.endsWith(",") && !prefix.endsWith("{") && !prefix.endsWith("[")) {
    prefix = `${prefix},`;
  }
  const needsNewline = !prefix.endsWith("\n");
  const insertion = `${needsNewline ? "\n" : ""}${additions.join("\n")}\n`;
  return `${prefix}${insertion}${content.slice(closeIdx)}`;
}

function extractExtendedParentType(source: string, typeName: string): string | null {
  const match = source.match(
    new RegExp(`(?:export\\s+)?interface\\s+${escapeRegExp(typeName)}\\s+extends\\s+(\\w+)`),
  );
  return match?.[1] ?? null;
}

export async function loadTypeProperties(
  fileContent: string,
  filePath: string,
  typeName: string,
  readFile: ReadProjectFile,
): Promise<Map<string, string> | null> {
  const candidates = resolveTypeSourcePaths(fileContent, filePath, typeName);
  let merged: Map<string, string> | null = null;
  let typeSource: string | null = null;

  for (const candidate of candidates) {
    const source = candidate === filePath ? fileContent : await readFile(candidate);
    if (!source) continue;
    const body = extractTypeBody(source, typeName);
    if (!body) continue;
    merged = parseTypeProperties(body);
    typeSource = source;
    break;
  }

  if (!merged) {
    const body = extractTypeBody(fileContent, typeName);
    if (body) {
      merged = parseTypeProperties(body);
      typeSource = fileContent;
    }
  }

  const parentType = extractExtendedParentType(typeSource ?? fileContent, typeName);
  if (parentType) {
    const parentProps = await loadTypeProperties(fileContent, filePath, parentType, readFile);
    if (parentProps) {
      const next = new Map(merged ?? []);
      for (const [key, value] of parentProps) {
        if (!next.has(key)) next.set(key, value);
      }
      merged = next;
    }
  }

  return merged && merged.size > 0 ? merged : null;
}

const SKIP_MISSING_PROPERTY_TYPES = new Set(["LayoutProps"]);

export async function applyMissingPropertyFix(
  relPath: string,
  content: string,
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ content: string; label: string } | null> {
  const missing = parseMissingPropertyError(diagnostic.code, diagnostic.message);
  if (!missing) return null;
  if (SKIP_MISSING_PROPERTY_TYPES.has(missing.typeName)) return null;

  const line = content.split("\n")[diagnostic.line - 1] ?? "";
  if (/element=\{<\s*Layout\b/.test(line) || /<\s*Layout\s*\/>/.test(line)) {
    return null;
  }

  const typeSource = await loadTypeSourceContent(content, relPath, missing.typeName, readFile);
  const typeProps = await loadTypeProperties(content, relPath, missing.typeName, readFile);
  const patched = patchObjectLiteralMissingProperties(
    content,
    diagnostic,
    missing,
    typeProps,
    typeSource,
  );
  if (!patched || patched === content) return null;

  return {
    content: patched,
    label: `added missing ${missing.typeName} properties: ${missing.missingProps.join(", ")}`,
  };
}

/** Add an unknown Record key reported by TS2353 directly on the object literal. */
export function applyRecordLiteralKeyFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
  property: string,
  typeName: string,
): { content: string; label: string } | null {
  if (!typeName.startsWith("Record<")) return null;
  const patched = patchObjectLiteralMissingProperties(
    content,
    diagnostic,
    { typeName, missingProps: [property] },
    new Map([[property, "string"]]),
    null,
  );
  if (!patched || patched === content) return null;
  return { content: patched, label: `added Record key ${property}` };
}

export async function collectRelatedTypeDefinitions(
  relPath: string,
  content: string,
  diagnostics: readonly TypeScriptDiagnostic[],
  readFile: ReadProjectFile,
): Promise<string> {
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const diagnostic of diagnostics) {
    const missing = parseMissingPropertyError(diagnostic.code, diagnostic.message);
    if (!missing) continue;
    const key = missing.typeName;
    if (seen.has(key)) continue;
    seen.add(key);

    const candidates = resolveTypeSourcePaths(content, relPath, missing.typeName);
    for (const candidate of candidates) {
      const source = await readFile(candidate);
      if (!source) continue;
      const body = extractTypeBody(source, missing.typeName);
      if (!body) continue;
      snippets.push(`// ${candidate}\nexport interface ${missing.typeName} {\n${body}\n}`);
      break;
    }
  }

  return snippets.join("\n\n");
}
