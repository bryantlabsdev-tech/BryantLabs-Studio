const TS_LIKE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;

/** Join project root with a project-relative path (renderer-safe). */
export function joinProjectPath(projectPath: string, relPath: string): string {
  const base = projectPath.replace(/\/$/, "");
  const rel = relPath.replace(/\\/g, "/").replace(/^\//, "");
  return `${base}/${rel}`;
}

export function isTypeScriptLikePath(relOrAbsPath: string): boolean {
  return TS_LIKE.test(relOrAbsPath);
}
