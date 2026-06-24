const CONFIG_PATH_RE =
  /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|tsconfig[^/]*\.json|vite\.config\.|vitest\.config\.|eslint\.|prettier\.|tailwind\.config\.|postcss\.config\.|next\.config\.)/i;

/** Tooling/config paths that should not be plan targets for UI/feature prompts. */
export function isConfigArtifactPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/");
  if (CONFIG_PATH_RE.test(norm)) return true;
  if (norm === "index.html") return true;
  return false;
}
