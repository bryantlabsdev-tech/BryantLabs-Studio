export const GREENFIELD_PATHS = [
  "package.json",
  "index.html",
  "src/main.tsx",
  "tsconfig.json",
  "vite.config.ts",
  "src/index.css",
  "src/App.tsx",
] as const;

/** Safe supplementary files auto-created when tsconfig references them. */
export const GREENFIELD_SUPPLEMENTARY_PATHS = ["tsconfig.node.json"] as const;

export type GreenfieldPath = (typeof GREENFIELD_PATHS)[number];
export type GreenfieldSupplementaryPath =
  (typeof GREENFIELD_SUPPLEMENTARY_PATHS)[number];
export type GeneratedFilePath =
  | GreenfieldPath
  | GreenfieldSupplementaryPath
  | `src/${string}.tsx`
  | `src/${string}.ts`
  | `src/${string}.css`
  | `public/${string}`
  | "tailwind.config.js"
  | "postcss.config.js";

export const GREENFIELD_CONFIG_PATHS = [
  "tailwind.config.js",
  "postcss.config.js",
] as const;

const SRC_FILE_RE =
  /^src\/[a-zA-Z0-9][a-zA-Z0-9/_-]*\.(tsx|ts|css|json)$/;

const PUBLIC_FILE_RE =
  /^public\/[a-zA-Z0-9][a-zA-Z0-9._/-]*\.(svg|png|ico|webmanifest|txt|json)$/;

export function isAllowedGreenfieldWritePath(filePath: string): boolean {
  if (filePath.includes("..") || filePath.includes("\\") || filePath.includes("\0")) {
    return false;
  }
  if (GREENFIELD_PATHS.includes(filePath as GreenfieldPath)) return true;
  if (GREENFIELD_SUPPLEMENTARY_PATHS.includes(filePath as GreenfieldSupplementaryPath)) {
    return true;
  }
  if (GREENFIELD_CONFIG_PATHS.includes(filePath as (typeof GREENFIELD_CONFIG_PATHS)[number])) {
    return true;
  }
  if (SRC_FILE_RE.test(filePath)) return true;
  return PUBLIC_FILE_RE.test(filePath);
}

export const GREENFIELD_REPAIRABLE_REFERENCES = new Set<string>([
  "tsconfig.node.json",
]);
