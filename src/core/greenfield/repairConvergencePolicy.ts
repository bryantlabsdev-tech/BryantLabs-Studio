/** Shared rules for deterministic repair ordering and unsafe-target guards. */

export function normalizeProjectRelPath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isPageSourceFile(relPath: string): boolean {
  const normalized = normalizeProjectRelPath(relPath);
  return normalized.startsWith("src/pages/") || normalized.includes("/pages/");
}

/** Page files should get literal completion before mock/type relaxation. */
export function shouldRelaxMockEntityTypes(relPath: string): boolean {
  return !isPageSourceFile(relPath);
}

export function shouldAlignUseStateWithRelaxedMock(relPath: string): boolean {
  return !isPageSourceFile(relPath);
}

const UNSAFE_COMPLETION_TYPE_RE =
  /ForwardRefExoticComponent|ExoticComponent|LucideProps|Icon[\w]*Props|\$\$typeof|ComponentType(?:<|$)|FunctionComponent(?:<|$)|FC(?:<|$)|SVGProps|IntrinsicAttributes|LucideIcon/;

export function isUnsafeObjectLiteralCompletionTarget(typeName: string): boolean {
  const base = typeName.includes(" & ") ? typeName.split(" & ")[0]!.trim() : typeName;
  return UNSAFE_COMPLETION_TYPE_RE.test(base) || UNSAFE_COMPLETION_TYPE_RE.test(typeName);
}

export function filterCompletionProperties(properties: readonly string[]): string[] {
  return properties.filter(
    (prop) =>
      !prop.startsWith("$$") &&
      prop !== "ref" &&
      prop !== "key" &&
      prop !== "children",
  );
}
