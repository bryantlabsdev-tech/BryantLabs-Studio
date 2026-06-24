/** Extract JSX/HTML class names referenced in App.tsx (or similar). */
export function extractClassNamesFromSource(source: string): string[] {
  const seen = new Set<string>();
  const patterns = [
    /className\s*=\s*["'{`][^"'`}]+["'`}]/g,
    /className\s*=\s*\{[^}]+\}/g,
    /class\s*=\s*["'][^"']+["']/g,
  ];

  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      const raw = match[0] ?? "";
      const quoted =
        raw.match(/["'`]([^"'`]+)["'`]/)?.[1] ??
        raw.match(/\{`([^`]+)`\}/)?.[1] ??
        raw.match(/\{"([^"]+)"\}/)?.[1];
      if (!quoted) continue;
      for (const token of quoted.split(/\s+/)) {
        const t = token.trim();
        if (t && !t.includes("${")) seen.add(t);
      }
    }
  }

  return [...seen];
}

export function summarizeAppTsxForContext(
  source: string,
  classNames: readonly string[],
): string {
  const lines = source.split("\n").length;
  const classLine =
    classNames.length > 0
      ? `Class names: ${classNames.join(", ")}`
      : "Class names: (none detected)";
  return [
    `App.tsx structure summary (${lines} lines).`,
    "Modify layout/styling via index.css; preserve component structure.",
    classLine,
  ].join("\n");
}
