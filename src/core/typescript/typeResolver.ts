import type { ReadProjectFile } from "@/core/typescript/missingPropertyRepair";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTypeProperties(typeBody: string): Map<string, string> {
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

function extractTypeBody(source: string, typeName: string): string | null {
  const headerRe = new RegExp(
    `(?:export\\s+)?(?:type|interface)\\s+${escapeRegExp(typeName)}\\s*(?:=\\s*|\\{)`,
    "m",
  );
  const headerMatch = source.match(headerRe);
  if (!headerMatch || headerMatch.index === undefined) return null;

  const isInterface = /interface\s/.test(headerMatch[0]);
  const start = headerMatch.index + headerMatch[0].length;
  const slice = source.slice(start);

  if (isInterface) {
    let depth = 1;
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i]!;
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) return slice.slice(0, i);
      }
    }
    return null;
  }

  if (slice.startsWith("{")) {
    let depth = 0;
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i]!;
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) return slice.slice(0, i + 1);
      }
    }
  }

  let depth = 0;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i]!;
    if (ch === "{" || ch === "(") depth += 1;
    if (ch === "}" || ch === ")") depth -= 1;
    if (ch === ";" && depth === 0) return slice.slice(0, i).trim();
  }

  return null;
}

function mergeIntersectionBody(body: string): Map<string, string> {
  const props = new Map<string, string>();
  const parts = body.split(/\s*&\s*/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("{")) {
      const inner = trimmed.replace(/^\{/, "").replace(/\}\s*$/, "");
      for (const [k, v] of parseTypeProperties(inner)) {
        props.set(k, v);
      }
      continue;
    }
    if (/^[A-Z][A-Za-z0-9_]*$/.test(trimmed)) {
      props.set(`__extends__:${trimmed}`, trimmed);
    }
  }
  return props;
}

async function resolveTypeBodyRecursive(
  typeName: string,
  fileContent: string,
  filePath: string,
  readFile: ReadProjectFile,
  seen: Set<string>,
): Promise<Map<string, string>> {
  if (seen.has(typeName)) return new Map();
  seen.add(typeName);

  const candidates: string[] = [filePath, "src/types.ts", "src/types/index.ts"];
  const importRe = new RegExp(
    `import\\s+(?:type\\s+)?\\{[^}]*\\b${escapeRegExp(typeName)}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`,
  );
  const importMatch = fileContent.match(importRe);
  if (importMatch?.[1]?.startsWith(".")) {
    const fromDir = filePath.replace(/\/[^/]+$/, "") || ".";
    const parts = importMatch[1].split("/");
    const stack = fromDir === "." ? [] : fromDir.split("/");
    for (const part of parts) {
      if (part === "." || !part) continue;
      if (part === "..") {
        stack.pop();
        continue;
      }
      stack.push(part);
    }
    let resolved = stack.join("/");
    if (!resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) resolved += ".ts";
    candidates.unshift(resolved);
  }

  for (const candidate of candidates) {
    const source = candidate === filePath ? fileContent : await readFile(candidate);
    if (!source) continue;
    const body = extractTypeBody(source, typeName);
    if (!body) continue;

    const merged = new Map<string, string>();
    if (body.includes("&")) {
      const parts = mergeIntersectionBody(body);
      for (const [key, value] of parts) {
        if (key.startsWith("__extends__:")) {
          const parent = await resolveTypeBodyRecursive(value, source, candidate, readFile, seen);
          for (const [pk, pv] of parent) merged.set(pk, pv);
        } else {
          merged.set(key, value);
        }
      }
      return merged;
    }

    if (body.startsWith("{")) {
      return parseTypeProperties(body.replace(/^\{/, "").replace(/\}\s*$/, ""));
    }

    if (/^[A-Z][A-Za-z0-9_]*$/.test(body)) {
      return resolveTypeBodyRecursive(body, source, candidate, readFile, seen);
    }
  }

  return new Map();
}

export async function resolveTypeProperties(
  typeName: string,
  fileContent: string,
  filePath: string,
  readFile: ReadProjectFile,
): Promise<Map<string, string>> {
  const clean = typeName.replace(/\[\]$/, "").trim();
  return resolveTypeBodyRecursive(clean, fileContent, filePath, readFile, new Set());
}

export function extractTargetTypeName(message: string): string | null {
  const match = message.match(/is not assignable to type '([^']+)'/);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  if (raw.includes(" & ")) return raw;
  return raw.replace(/\[\]$/, "").trim();
}
