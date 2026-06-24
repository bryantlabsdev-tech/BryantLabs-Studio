import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import {
  type ReadProjectFile,
  findObjectLiteralBounds,
} from "@/core/typescript/missingPropertyRepair";
import { rewriteIconImportInFile } from "@/core/typescript/iconLibraryRepair";

const TS2353_RE =
  /Object literal may only specify known properties, and (?:'([^']+)'|"([^"]+)") does not exist in type '([^']+)'/;
const TS2307_RE = /Cannot find module ['"]([^'"]+)['"]/;

export function parseTs2353Error(
  message: string,
): { property: string; typeName: string } | null {
  const match = message.match(TS2353_RE);
  if (!match) return null;
  const property = (match[1] ?? match[2] ?? "").trim();
  const typeName = match[3]!.trim();
  if (!property || !typeName) return null;
  return { property, typeName };
}

export function parseTs2307Error(message: string): string | null {
  return message.match(TS2307_RE)?.[1] ?? null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRelPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function inferPropertyTypeFromLiteral(
  source: string,
  diagnostic: TypeScriptDiagnostic,
  property: string,
): string {
  const bounds = findObjectLiteralBounds(source, diagnostic.line, diagnostic.column);
  if (!bounds) return "unknown";
  const literal = source.slice(bounds.start, bounds.end + 1);
  const propRe = new RegExp(
    `(?:^|[,{]\\s*)['"]?${escapeRegExp(property)}['"]?\\s*:\\s*([^,\\n}]+)`,
    "m",
  );
  const match = literal.match(propRe);
  if (!match?.[1]) return "unknown";
  const value = match[1].trim();
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return "number";
  if (/^['"]/.test(value)) return "string";
  if (/^(true|false)$/.test(value)) return "boolean";
  if (/^\[/.test(value)) return "unknown[]";
  if (/^\{/.test(value)) return "Record<string, unknown>";
  return "unknown";
}

function extractInterfaceBody(source: string, typeName: string): { start: number; end: number; body: string } | null {
  const ifaceRe = new RegExp(
    `(export\\s+interface\\s+${escapeRegExp(typeName)}\\s*\\{)([\\s\\S]*?)(\\n\\})`,
    "m",
  );
  const ifaceMatch = source.match(ifaceRe);
  if (ifaceMatch && ifaceMatch.index !== undefined && ifaceMatch.index >= 0) {
    return {
      start: ifaceMatch.index + ifaceMatch[1]!.length,
      end: ifaceMatch.index + ifaceMatch[0].length - 2,
      body: ifaceMatch[2]!,
    };
  }

  const aliasHeader = new RegExp(
    `export\\s+type\\s+${escapeRegExp(typeName)}\\s*=\\s*[\\s\\S]*?\\{`,
    "m",
  );
  const aliasMatch = source.match(aliasHeader);
  if (!aliasMatch || aliasMatch.index === undefined) return null;
  const openBrace = aliasMatch.index + aliasMatch[0].length - 1;
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          start: openBrace + 1,
          end: i,
          body: source.slice(openBrace + 1, i),
        };
      }
    }
  }
  return null;
}

function interfacePropertyNames(body: string): Set<string> {
  const names = new Set<string>();
  for (const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)) {
    names.add(match[1]!);
  }
  return names;
}

function renameCandidatesForUnknownProperty(property: string): string[] {
  const candidates: string[] = [];
  if (property.endsWith("Name")) {
    candidates.push(property.slice(0, -4));
  }
  if (property.endsWith("Id")) {
    candidates.push(property.slice(0, -2));
  }
  const aliases: Record<string, string[]> = {
    clientName: ["client", "name"],
    patientName: ["patient", "name"],
    studentName: ["student", "name"],
  };
  const mapped = aliases[property];
  if (mapped) candidates.push(...mapped);
  return [...new Set(candidates.filter(Boolean))];
}

/** Rename a stray literal property when types.ts already defines a close match. */
export async function applyTs2353LiteralPropertyFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ content: string; label: string } | null> {
  const parsed = parseTs2353Error(diagnostic.message);
  if (!parsed || parsed.typeName.startsWith("Record<")) return null;

  const typesSource = await readFile("src/types.ts");
  if (!typesSource) return null;

  const iface = extractInterfaceBody(typesSource, parsed.typeName);
  if (!iface) return null;

  const knownProps = interfacePropertyNames(iface.body);
  if (knownProps.has(parsed.property)) return null;

  const bounds = findObjectLiteralBounds(content, diagnostic.line, diagnostic.column);
  if (!bounds) return null;

  for (const candidate of renameCandidatesForUnknownProperty(parsed.property)) {
    if (!knownProps.has(candidate)) continue;
    const literal = content.slice(bounds.start, bounds.end + 1);
    const propRe = new RegExp(
      `(^|[,{]\\s*)(['"]?)${escapeRegExp(parsed.property)}\\2\\s*:`,
      "m",
    );
    if (!propRe.test(literal)) continue;
    const renamedLiteral = literal.replace(
      propRe,
      `$1$2${candidate}$2:`,
    );
    const next =
      content.slice(0, bounds.start) + renamedLiteral + content.slice(bounds.end + 1);
    if (next === content) continue;
    return {
      content: next,
      label: `renamed ${parsed.property} to ${candidate} on ${parsed.typeName} literal`,
    };
  }

  return null;
}

/** Add a missing object-literal property to the interface in src/types.ts. */
export async function applyTs2353TypeAugmentation(
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ path: string; content: string; label: string } | null> {
  const parsed = parseTs2353Error(diagnostic.message);
  if (!parsed) return null;

  const typesSource = await readFile("src/types.ts");
  if (!typesSource) return null;

  const iface = extractInterfaceBody(typesSource, parsed.typeName);
  if (!iface) return null;
  if (new RegExp(`\\b${escapeRegExp(parsed.property)}\\??\\s*:`).test(iface.body)) {
    return null;
  }

  const diagnosticFile = await readFile(normalizeRelPath(diagnostic.file));
  const inferredType = diagnosticFile
    ? inferPropertyTypeFromLiteral(diagnosticFile, diagnostic, parsed.property)
    : "unknown";
  const insertion = `\n  ${parsed.property}?: ${inferredType};`;
  const next =
    typesSource.slice(0, iface.end) + insertion + typesSource.slice(iface.end);

  return {
    path: "src/types.ts",
    content: next,
    label: `added optional ${parsed.typeName}.${parsed.property} to types.ts`,
  };
}

const ICON_MODULE_PREFIXES = ["react-icons/", "@heroicons/react", "lucide-react"];

export function stripUnsupportedIconImports(content: string, moduleName: string): string | null {
  if (!ICON_MODULE_PREFIXES.some((prefix) => moduleName.startsWith(prefix))) {
    return null;
  }

  let next = content;
  const importRe = new RegExp(
    `^\\s*import\\s+(?:\\{[^}]+\\}|\\w+)\\s+from\\s+['"]${escapeRegExp(moduleName)}['"];?\\s*\\n`,
    "m",
  );
  if (!importRe.test(next)) return null;
  next = next.replace(importRe, "");

  next = next.replace(/<[A-Z][A-Za-z0-9]*\s*[^>]*\/>/g, "<span className=\"inline-block w-4 h-4\" />");
  next = next.replace(/<[A-Z][A-Za-z0-9]*\s*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z0-9]*>/g, "<span />");

  if (next === content) return null;
  return next;
}

export function applyTs2307MissingModuleFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
  relPath = "src/pages/Unknown.tsx",
): { content: string; label: string } | null {
  const moduleName = parseTs2307Error(diagnostic.message);
  if (!moduleName) return null;
  const rewritten = rewriteIconImportInFile(content, relPath);
  if (rewritten) {
    return { content: rewritten.content, label: `rewrote icon import ${moduleName} to stub` };
  }
  const stripped = stripUnsupportedIconImports(content, moduleName);
  if (!stripped || stripped === content) return null;
  return { content: stripped, label: `removed unsupported import ${moduleName}` };
}

const TS2322_LITERAL_RE = /Type '([^']+)' is not assignable to type '([^']+)'/;
const TS2678_LITERAL_RE = /Type '([^']+)' is not comparable to type '([^']+)'/;

function addLiteralToTypeAlias(source: string, typeName: string, literal: string): string | null {
  const unquoted = literal.replace(/^['"]|['"]$/g, "");
  const typeRe = new RegExp(
    `(export\\s+type\\s+${escapeRegExp(typeName)}\\s*=\\s*)([^;\\n]+)`,
    "m",
  );
  const match = source.match(typeRe);
  if (!match || match.index === undefined) return null;
  const unionBody = match[2]!;
  if (unionBody.includes(`"${unquoted}"`) || unionBody.includes(`'${unquoted}'`)) {
    return null;
  }
  const nextUnion = `${unionBody.trim()} | "${unquoted}"`;
  return source.replace(typeRe, `$1${nextUnion}`);
}

function addLiteralToEnum(source: string, typeName: string, literal: string): string | null {
  const unquoted = literal.replace(/^['"]|['"]$/g, "");
  const enumRe = new RegExp(
    `(export\\s+enum\\s+${escapeRegExp(typeName)}\\s*\\{)([^}]*)(\\})`,
    "m",
  );
  const match = source.match(enumRe);
  if (!match || match.index === undefined) return null;
  const body = match[2]!;
  if (new RegExp(`\\b${escapeRegExp(unquoted)}\\b`).test(body)) return null;
  const insertion = body.trim().length > 0 ? `\n  ${unquoted} = "${unquoted}",` : `\n  ${unquoted} = "${unquoted}",`;
  return source.replace(enumRe, `$1${body}${insertion}\n$3`);
}

/** Extend a string-literal union in types.ts when generated code uses an unlisted value. */
export async function applyUnionLiteralAugmentation(
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ path: string; content: string; label: string } | null> {
  const match =
    diagnostic.message.match(TS2322_LITERAL_RE) ??
    diagnostic.message.match(TS2678_LITERAL_RE);
  if (!match) return null;
  const literal = match[1]!;
  const typeName = match[2]!;
  if (!/^['"]/.test(literal)) return null;

  const typesSource = await readFile("src/types.ts");
  if (!typesSource) return null;
  const next =
    addLiteralToTypeAlias(typesSource, typeName, literal) ??
    addLiteralToEnum(typesSource, typeName, literal);
  if (!next || next === typesSource) return null;

  return {
    path: "src/types.ts",
    content: next,
    label: `added ${literal} to ${typeName} union`,
  };
}
