import {
  filterCompletionProperties,
  isUnsafeObjectLiteralCompletionTarget,
} from "@/core/greenfield/repairConvergencePolicy";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import {
  defaultValueForProperty,
  findObjectLiteralBounds,
  type ReadProjectFile,
} from "@/core/typescript/missingPropertyRepair";
import { extractTargetTypeName } from "@/core/typescript/typeResolver";
import { resolveTypeProperties } from "@/core/typescript/typeResolver";

function existingPropertyNames(objectLiteral: string): Set<string> {
  const names = new Set<string>();
  for (const match of objectLiteral.matchAll(/(?:^|[,{]\s*)(?:['"]([^'"]+)['"]|([\w$]+))\s*:/gm)) {
    const name = (match[1] ?? match[2] ?? "").trim();
    if (name) names.add(name);
  }
  return names;
}

function propertyIndent(objectLiteral: string): string {
  const lines = objectLiteral.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i]!.match(/^(\s+)\S/);
    if (m) return m[1]!;
  }
  return "  ";
}

export async function completeObjectLiteralForType(
  relPath: string,
  content: string,
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ content: string; label: string } | null> {
  if (diagnostic.code !== "TS2322") return null;
  const targetType = extractTargetTypeName(diagnostic.message);
  if (!targetType) return null;

  const bounds = findObjectLiteralBounds(content, diagnostic.line, diagnostic.column);
  if (!bounds) return null;

  const typeName = targetType.includes(" & ") ? targetType.split(" & ")[0]!.trim() : targetType;
  if (isUnsafeObjectLiteralCompletionTarget(typeName)) return null;

  const typeProps = await resolveTypeProperties(typeName, content, relPath, readFile);
  if (typeProps.size === 0) return null;

  const literal = content.slice(bounds.start, bounds.end + 1);
  const present = existingPropertyNames(literal);
  const missing = filterCompletionProperties(
    [...typeProps.keys()].filter((key) => !present.has(key)),
  );
  if (missing.length === 0) return null;

  const typeSource = await readFile("src/types.ts");
  const indent = propertyIndent(literal);
  const additions = missing.map((prop) => {
    const typeStr = typeProps.get(prop) ?? "string";
    const value = defaultValueForProperty(prop, typeStr, typeSource);
    const key = /[^a-zA-Z0-9_$]/.test(prop) ? `"${prop}"` : prop;
    return `${indent}${key}: ${value},`;
  });

  const closeIdx = bounds.end;
  let prefix = content.slice(0, closeIdx).trimEnd();
  if (!prefix.endsWith(",") && !prefix.endsWith("{") && !prefix.endsWith("[")) {
    prefix = `${prefix},`;
  }
  const insertion = `${prefix.endsWith("\n") ? "" : "\n"}${additions.join("\n")}\n`;
  const next = `${prefix}${insertion}${content.slice(closeIdx)}`;
  if (next === content) return null;

  return {
    content: next,
    label: `completed ${typeName} fields: ${missing.join(", ")}`,
  };
}
