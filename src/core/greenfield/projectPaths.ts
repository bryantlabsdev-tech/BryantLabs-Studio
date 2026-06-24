import { GREENFIELD_FILE_PATHS, type GreenfieldFilePath } from "@/core/greenfield/types";

/** Core files every greenfield project must include. */
export const GREENFIELD_CORE_PATHS = GREENFIELD_FILE_PATHS;

const ALLOWED_ROOT = new Set<string>([...GREENFIELD_FILE_PATHS]);

const SRC_FILE_RE =
  /^src\/[a-zA-Z0-9][a-zA-Z0-9/_-]*\.(tsx|ts|css|json)$/;

export function isAllowedGreenfieldProjectPath(path: string): boolean {
  if (ALLOWED_ROOT.has(path)) return true;
  if (path === "postcss.config.js" || path === "tailwind.config.js") return true;
  return SRC_FILE_RE.test(path);
}

export function assertAllowedProjectPaths(paths: readonly string[]): string[] {
  const rejected: string[] = [];
  for (const p of paths) {
    if (!isAllowedGreenfieldProjectPath(p)) rejected.push(p);
  }
  return rejected;
}

export function missingCorePaths(
  files: readonly { readonly path: string }[],
): GreenfieldFilePath[] {
  const present = new Set(files.map((f) => f.path));
  return GREENFIELD_FILE_PATHS.filter((p) => !present.has(p));
}
