import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { ReadProjectFile } from "@/core/typescript/missingPropertyRepair";
import {
  applyTs2353TypeAugmentation,
  applyUnionLiteralAugmentation,
  parseTs2353Error,
} from "@/core/typescript/typeShapeRepair";

/** Apply all TS2353 / union-literal fixes against src/types.ts in one pass. */
export async function repairTypesFromDiagnostics(
  diagnostics: readonly TypeScriptDiagnostic[],
  readFile: ReadProjectFile,
): Promise<{ content: string; labels: string[] } | null> {
  const labels: string[] = [];
  let typesSource = await readFile("src/types.ts");
  if (!typesSource) return null;

  const reader = async (path: string) =>
    path === "src/types.ts" ? typesSource : readFile(path);

  const seen = new Set<string>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.code === "TS2322" && NUMBER_TO_STRING_RE.test(diagnostic.message)) {
      const key = `prim:${diagnostic.file}:${diagnostic.line}:${diagnostic.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reader = async (path: string) =>
        path === "src/types.ts" ? typesSource : readFile(path);
      const fixed = await fixPrimitiveTypeMismatchInTypes(diagnostic, reader);
      if (fixed) {
        typesSource = fixed.content;
        labels.push(fixed.label);
      }
    }

    if (diagnostic.code === "TS2353") {
      const key = `2353:${diagnostic.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const result = await applyTs2353TypeAugmentation(diagnostic, reader);
      if (!result) continue;
      typesSource = result.content;
      labels.push(result.label);
      continue;
    }

    if (diagnostic.code === "TS2322" || diagnostic.code === "TS2678") {
      if (parseTs2353Error(diagnostic.message)) continue;
      if (/Type 'number' is not assignable to type 'string'/.test(diagnostic.message)) continue;
      const key = `union:${diagnostic.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const result = await applyUnionLiteralAugmentation(diagnostic, reader);
      if (!result) continue;
      typesSource = result.content;
      labels.push(result.label);
    }
  }

  if (labels.length === 0) return null;
  return { content: typesSource, labels };
}

/** Remove junk properties accidentally injected into type/object literals during repair. */
export function cleanCorruptedTypeDefinitions(content: string): string | null {
  let next = content;
  next = next.replace(/\n\s+[A-Z][A-Za-z ]+\?\s*:\s*string;\}/g, "\n}");
  next = next.replace(/(\n\s*status\?\s*:\s*string;)\s*\n\s+[A-Z][A-Za-z ]+\?\s*:\s*string;/g, "$1");
  return next === content ? null : next;
}

/** Relax required props on LayoutProps / similar shell interfaces. */
export function relaxLayoutPropsInterfaces(content: string): string | null {
  let next = content;
  let changed = false;

  next = next.replace(
    /interface\s+LayoutProps\s*\{([^}]*)\}/g,
    (_match, body: string) => {
      const relaxed = body.replace(
        /^(\s*)(\w+)(\s*):/gm,
        (line: string, indent: string, name: string, gap: string) => {
          if (line.includes("?:")) return line;
          changed = true;
          return `${indent}${name}?${gap}:`;
        },
      );
      return `interface LayoutProps {${relaxed}}`;
    },
  );

  next = next.replace(
    /type\s+LayoutProps\s*=\s*\{([^}]*)\}/g,
    (_match, body: string) => {
      const relaxed = body.replace(
        /^(\s*)(\w+)(\s*):/gm,
        (line: string, indent: string, name: string, gap: string) => {
          if (line.includes("?:")) return line;
          changed = true;
          return `${indent}${name}?${gap}:`;
        },
      );
      return `type LayoutProps = {${relaxed}}`;
    },
  );

  if (!changed || next === content) return null;
  return next;
}

/** Fix optional props mangled by an earlier relax pass (`children? ReactNode` → `children?: ReactNode`). */
export function fixMalformedOptionalProps(content: string): string | null {
  const next = content.replace(
    /^(\s*)(\w+)\?\s+([A-Za-z_$][\w$.[\]]*)/gm,
    "$1$2?: $3",
  );
  return next === content ? null : next;
}

/** Undo bad missing-property patches on Layout route elements. */
export function fixCorruptedLayoutElementProps(content: string): string | null {
  const next = content.replace(
    /element=\{<\s*Layout\s*\/>\s*,[\s\S]*?\n\}/g,
    "element={<Layout />}",
  );
  return next === content ? null : next;
}

const NUMBER_TO_STRING_RE = /Type 'number' is not assignable to type 'string'/;

function propertyNameAtColumn(line: string, column: number): string | null {
  const before = line.slice(0, Math.max(0, column - 1));
  const match = before.match(/(?:^|[,{]\s*)(['"]?)([\w$]+)\1\s*:\s*[^,]*$/);
  return match?.[2] ?? null;
}

/** When mock data uses numbers but types.ts declared string, fix the interface field. */
export async function fixPrimitiveTypeMismatchInTypes(
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ content: string; label: string } | null> {
  if (!NUMBER_TO_STRING_RE.test(diagnostic.message)) return null;
  const source = await readFile(normalizeRelPath(diagnostic.file));
  if (!source) return null;
  const line = source.split("\n")[diagnostic.line - 1];
  if (!line) return null;
  const prop = propertyNameAtColumn(line, diagnostic.column);
  if (!prop) return null;
  const valueMatch = line.match(new RegExp(`${escapeRegExp(prop)}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (!valueMatch) return null;

  const typesSource = await readFile("src/types.ts");
  if (!typesSource) return null;
  const fieldRe = new RegExp(`(\\b${escapeRegExp(prop)}\\??\\s*:\\s*)string\\b`);
  if (!fieldRe.test(typesSource)) return null;
  const next = typesSource.replace(fieldRe, "$1number");
  if (next === typesSource) return null;
  return { content: next, label: `changed ${prop} from string to number in types.ts` };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRelPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Restore numeric literals that were incorrectly quoted as strings. */
export function fixStringToNumberLiteral(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): string | null {
  if (!/Type 'string' is not assignable to type 'number'/.test(diagnostic.message)) return null;
  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx]!;
  const prop = propertyNameAtColumn(line, diagnostic.column);
  const fixed = prop
    ? line.replace(
        new RegExp(`(${escapeRegExp(prop)}\\s*:\\s*)"(-?\\d+(?:\\.\\d+)?)"(\\s*[,}])`),
        "$1$2$3",
      )
    : line.replace(/(:\s*)"(-?\d+(?:\.\d+)?)"(\s*[,}])/g, "$1$2$3");
  if (fixed === line) return null;
  lines[idx] = fixed;
  return lines.join("\n");
}

/** Coerce numeric literals to strings when a field expects string. */
export function fixNumberToStringLiteral(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): string | null {
  if (!NUMBER_TO_STRING_RE.test(diagnostic.message)) return null;
  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx]!;
  const prop = propertyNameAtColumn(line, diagnostic.column);
  const fixed = prop
    ? line.replace(
        new RegExp(`(${escapeRegExp(prop)}\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)(\\s*[,}])`),
        '$1"$2"$3',
      )
    : line.replace(/(:\s*)(\d+(?:\.\d+)?)(\s*[,}])/g, '$1"$2"$3');
  if (fixed === line) return null;
  lines[idx] = fixed;
  return lines.join("\n");
}
