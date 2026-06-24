import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { ReadProjectFile } from "@/core/typescript/missingPropertyRepair";

const TS2614_MEMBER_RE = /has no exported member '([^']+)'/;
const TS2614_MODULE_RE = /Module '([^']+)'/;
const TS2614_SUGGEST_DEFAULT_RE = /Did you mean to use 'import \w+ from/;

export function parseTs2614Error(
  message: string,
): { member: string; moduleSpecifier: string | null; suggestDefaultImport: boolean } | null {
  const memberMatch = message.match(TS2614_MEMBER_RE);
  if (!memberMatch) return null;
  const moduleMatch = message.match(TS2614_MODULE_RE);
  return {
    member: memberMatch[1]!,
    moduleSpecifier: moduleMatch?.[1]?.replace(/^"|"$/g, "") ?? null,
    suggestDefaultImport: TS2614_SUGGEST_DEFAULT_RE.test(message),
  };
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
    if (!resolved.includes(".")) resolved += ".tsx";
  }
  return resolved;
}

/** Normalize Layout/Sidebar-style components to named exports. */
export function normalizeNamedComponentExport(
  content: string,
  componentName: string,
): string | null {
  if (new RegExp(`export\\s+function\\s+${componentName}\\b`).test(content)) {
    return null;
  }

  if (new RegExp(`export\\s+default\\s+function\\s+${componentName}\\b`).test(content)) {
    return content.replace(
      new RegExp(`export\\s+default\\s+function\\s+${componentName}\\b`),
      `export function ${componentName}`,
    );
  }

  const arrowFn = new RegExp(
    `^\\s*const\\s+${componentName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
    "m",
  );
  if (arrowFn.test(content)) {
    return content.replace(
      new RegExp(`const\\s+${componentName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`),
      `export function ${componentName}() {`,
    );
  }

  const plainFn = new RegExp(`^\\s*function\\s+${componentName}\\s*\\(`, "m");
  if (plainFn.test(content) && !new RegExp(`export\\s+function\\s+${componentName}`).test(content)) {
    return content.replace(
      new RegExp(`(^\\s*)function\\s+${componentName}\\s*\\(`, "m"),
      `$1export function ${componentName}(`,
    );
  }

  if (
    new RegExp(`const\\s+${componentName}\\s*=`).test(content) &&
    !new RegExp(`export\\s+(?:const|function)\\s+${componentName}`).test(content)
  ) {
    return content.replace(
      new RegExp(`const\\s+${componentName}\\s*=`),
      `export const ${componentName} =`,
    );
  }

  return null;
}

function fixImporterToDefault(
  content: string,
  member: string,
  moduleSpecifier: string,
): string | null {
  const namedRe = new RegExp(
    `import\\s+\\{\\s*${escapeRegExp(member)}\\s*\\}\\s+from\\s+(['"])${escapeRegExp(moduleSpecifier)}\\1\\s*;?`,
  );
  const match = content.match(namedRe);
  if (!match) return null;
  const quote = match[1]!;
  return content.replace(
    namedRe,
    `import ${member} from ${quote}${moduleSpecifier}${quote};`,
  );
}

const TS2613_DEFAULT_RE = /has no default export.*Did you mean to use 'import \{ ([^}]+) \}/;
const TS2613_MEMBER_RE = /Module '[^']+' has no default export/;

export function parseTs2613Error(
  message: string,
): { member: string; moduleSpecifier: string | null; suggestNamedImport: boolean } | null {
  if (!TS2613_MEMBER_RE.test(message)) return null;
  const moduleMatch = message.match(TS2614_MODULE_RE);
  const namedMatch = message.match(TS2613_DEFAULT_RE);
  return {
    member: namedMatch?.[1]?.split(",")[0]?.trim() ?? "Sidebar",
    moduleSpecifier: moduleMatch?.[1]?.replace(/^"|"$/g, "") ?? null,
    suggestNamedImport: Boolean(namedMatch),
  };
}

function fixDefaultImporterToNamed(
  content: string,
  member: string,
  moduleSpecifier: string,
): string | null {
  const defaultRe = new RegExp(
    `import\\s+${escapeRegExp(member)}\\s+from\\s+(['"])${escapeRegExp(moduleSpecifier)}\\1\\s*;?`,
  );
  const match = content.match(defaultRe);
  if (!match) return null;
  const quote = match[1]!;
  return content.replace(
    defaultRe,
    `import { ${member} } from ${quote}${moduleSpecifier}${quote};`,
  );
}

function fixImporterToNamed(
  content: string,
  member: string,
  moduleSpecifier: string,
): string | null {
  return fixDefaultImporterToNamed(content, member, moduleSpecifier);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function applyExportImportFix(
  relPath: string,
  content: string,
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ content: string; label: string; exporterPath?: string; exporterContent?: string } | null> {
  if (diagnostic.code === "TS2613") {
    const parsed = parseTs2613Error(diagnostic.message);
    if (!parsed?.suggestNamedImport) return null;
    const member = parsed.member;
    const genericRe = new RegExp(
      `import\\s+${escapeRegExp(member)}\\s+from\\s+(['"])([^'"]+)\\1\\s*;?`,
    );
    const match = content.match(genericRe);
    if (!match) return null;
    const quote = match[1]!;
    const specifier = match[2]!;
    const fixed = content.replace(
      genericRe,
      `import { ${member} } from ${quote}${specifier}${quote};`,
    );
    if (fixed === content) return null;
    return { content: fixed, label: `changed ${member} to named import` };
  }

  if (diagnostic.code !== "TS2614") return null;
  const parsed = parseTs2614Error(diagnostic.message);
  if (!parsed?.moduleSpecifier) return null;

  const moduleSpecifier = parsed.moduleSpecifier;
  const member = parsed.member;
  const exporterPath = resolveRelativeImport(relPath, moduleSpecifier);
  const exporterContent = await readFile(exporterPath);

  if (parsed.suggestDefaultImport) {
    const fixed = fixImporterToDefault(content, member, moduleSpecifier);
    if (fixed && fixed !== content) {
      return { content: fixed, label: `changed ${member} to default import` };
    }
  }

  if (exporterContent) {
    const normalized = normalizeNamedComponentExport(exporterContent, member);
    if (normalized && normalized !== exporterContent) {
      return {
        content,
        label: `added named export for ${member} in ${exporterPath}`,
        exporterPath,
        exporterContent: normalized,
      };
    }

    if (/export\s+default/.test(exporterContent)) {
      const fixed = fixImporterToDefault(content, member, moduleSpecifier);
      if (fixed && fixed !== content) {
        return { content: fixed, label: `changed ${member} to default import` };
      }
    }
  }

  const namedFix = fixImporterToNamed(content, member, moduleSpecifier);
  if (namedFix && namedFix !== content) {
    return { content: namedFix, label: `changed ${member} to named import` };
  }

  return null;
}
