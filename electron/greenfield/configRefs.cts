/** Shared tsconfig reference parsing for greenfield validation/repair. */

export function parseJsonWithComments(text: string): unknown {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n\r]*/g, "");
  return JSON.parse(stripped);
}

export function normalizeConfigPath(ref: string): string {
  return ref.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function collectConfigReferences(config: Record<string, unknown>): string[] {
  const refs: string[] = [];

  const references = config.references;
  if (Array.isArray(references)) {
    for (const item of references) {
      if (!item || typeof item !== "object") continue;
      const path = (item as { path?: unknown }).path;
      if (typeof path !== "string") continue;
      refs.push(normalizeConfigPath(path));
    }
  }

  const extendsField = config.extends;
  if (typeof extendsField === "string") {
    refs.push(normalizeConfigPath(extendsField));
  }

  return refs;
}
