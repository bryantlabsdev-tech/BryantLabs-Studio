import { collectConfigReferences, parseJsonWithComments } from "./configRefs.cjs";
import {
  GREENFIELD_CONFIG_REF_UNKNOWN_ERROR,
  prepareGreenfieldFiles,
} from "./configRepair.cjs";
import { GREENFIELD_PATHS } from "./paths.cjs";
import type { GeneratedFile } from "./generate.cjs";

export const GREENFIELD_CONFIG_REF_ERROR =
  "Generated configuration references missing files.";

export { parseJsonWithComments, normalizeConfigPath } from "./configRefs.cjs";
export { collectConfigReferences } from "./configRefs.cjs";
export { GREENFIELD_CONFIG_REF_UNKNOWN_ERROR } from "./configRepair.cjs";

export const GREENFIELD_PACKAGE_VERSION_ERROR =
  "Generated package.json uses unsupported dependency versions.";

export const GREENFIELD_VITE_ELECTRON_ERROR =
  "Generated vite.config.ts contains Electron-specific configuration. Greenfield apps must be plain Vite React apps.";

/** Substrings forbidden in generated vite.config.ts (Phase 10 browser-only apps). */
const VITE_CONFIG_FORBIDDEN = [
  "vite-plugin-electron",
  "electron-builder",
  "nodeintegration",
  "electron",
  "main",
  "preload",
] as const;

const PACKAGE_ELECTRON_FORBIDDEN = [
  "vite-plugin-electron",
  "electron-builder",
  "electron",
] as const;

function presentPathSet(files: readonly GeneratedFile[]): Set<string> {
  return new Set(files.map((f) => f.path));
}

const REQUIRED_DEPENDENCIES = {
  react: "^18.3.1",
  "react-dom": "^18.3.1",
} as const;

const REQUIRED_DEV_DEPENDENCIES = {
  "@types/react": "^18.3.3",
  "@types/react-dom": "^18.3.0",
  "@vitejs/plugin-react": "^5.0.0",
  typescript: "^5.4.5",
  vite: "^5.3.1",
} as const;

const UNSTABLE_VERSION_RE =
  /-(?:rc|beta|alpha|canary|next|experimental)(?:\.|$|-)|(?:^|[^\w])(?:rc|beta|alpha|canary|next|experimental)(?:\.|$|[-\d])/i;

function parseMajor(version: string): number | null {
  const trimmed = version.trim().replace(/^[\^~<>=\s]+/, "");
  const m = trimmed.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function versionIsUnstable(version: string): boolean {
  return UNSTABLE_VERSION_RE.test(version.trim());
}

function collectDependencyVersions(
  pkg: Record<string, unknown>,
): { name: string; version: string }[] {
  const out: { name: string; version: string }[] = [];
  for (const section of ["dependencies", "devDependencies"] as const) {
    const block = pkg[section];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    for (const [name, version] of Object.entries(block)) {
      if (typeof version === "string") out.push({ name, version });
    }
  }
  return out;
}

export function validatePackageJsonContent(content: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return GREENFIELD_PACKAGE_VERSION_ERROR;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return GREENFIELD_PACKAGE_VERSION_ERROR;
  }
  const pkg = parsed as Record<string, unknown>;
  const deps =
    pkg.dependencies && typeof pkg.dependencies === "object" && !Array.isArray(pkg.dependencies)
      ? (pkg.dependencies as Record<string, unknown>)
      : {};
  const devDeps =
    pkg.devDependencies &&
    typeof pkg.devDependencies === "object" &&
    !Array.isArray(pkg.devDependencies)
      ? (pkg.devDependencies as Record<string, unknown>)
      : {};

  for (const name of Object.keys(REQUIRED_DEPENDENCIES)) {
    if (typeof deps[name] !== "string") return GREENFIELD_PACKAGE_VERSION_ERROR;
  }
  for (const name of Object.keys(REQUIRED_DEV_DEPENDENCIES)) {
    if (typeof devDeps[name] !== "string") return GREENFIELD_PACKAGE_VERSION_ERROR;
  }

  for (const { version } of collectDependencyVersions(pkg)) {
    if (versionIsUnstable(version)) return GREENFIELD_PACKAGE_VERSION_ERROR;
  }

  const reactMajor = parseMajor(deps.react as string);
  const reactDomMajor = parseMajor(deps["react-dom"] as string);
  if (
    reactMajor === null ||
    reactDomMajor === null ||
    reactMajor !== reactDomMajor
  ) {
    return GREENFIELD_PACKAGE_VERSION_ERROR;
  }

  const typesReactMajor = parseMajor(devDeps["@types/react"] as string);
  const typesDomMajor = parseMajor(devDeps["@types/react-dom"] as string);
  if (
    typesReactMajor === null ||
    typesDomMajor === null ||
    typesReactMajor !== typesDomMajor ||
    typesReactMajor !== reactMajor
  ) {
    return GREENFIELD_PACKAGE_VERSION_ERROR;
  }

  return null;
}

function unresolvedConfigReferences(
  config: Record<string, unknown>,
  present: Set<string>,
): string[] {
  return collectConfigReferences(config).filter((ref) => !present.has(ref));
}

export function validateTsconfigContent(
  content: string,
  present: Set<string> = presentPathSet([]),
): string | null {
  let parsed: unknown;
  try {
    parsed = parseJsonWithComments(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const bad = unresolvedConfigReferences(parsed as Record<string, unknown>, present);
  if (bad.length > 0) {
    const unknown = bad.find(
      (ref) => !GREENFIELD_PATHS.includes(ref as (typeof GREENFIELD_PATHS)[number]),
    );
    return unknown
      ? GREENFIELD_CONFIG_REF_UNKNOWN_ERROR(unknown)
      : GREENFIELD_CONFIG_REF_ERROR;
  }
  return null;
}

export function validateViteConfigContent(content: string): string | null {
  const normalized = content.replace(/\s+/g, " ").toLowerCase();

  for (const token of VITE_CONFIG_FORBIDDEN) {
    if (normalized.includes(token)) {
      return GREENFIELD_VITE_ELECTRON_ERROR;
    }
  }

  const importSources = [
    ...content.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...content.matchAll(/\bimport\s+["']([^"']+)["']/g),
  ].map((m) => m[1]!);

  const allowed = new Set(["vite", "@vitejs/plugin-react"]);
  for (const src of importSources) {
    if (!allowed.has(src)) {
      return GREENFIELD_VITE_ELECTRON_ERROR;
    }
  }

  if (!/from\s+["']vite["']/.test(content)) {
    return GREENFIELD_VITE_ELECTRON_ERROR;
  }
  if (!/from\s+["']@vitejs\/plugin-react["']/.test(content)) {
    return GREENFIELD_VITE_ELECTRON_ERROR;
  }
  if (/vite-plugin-electron|electron-builder|nodeIntegration/i.test(content)) {
    return GREENFIELD_VITE_ELECTRON_ERROR;
  }

  return null;
}

export function validatePackageJsonNoElectron(content: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const pkg = parsed as Record<string, unknown>;
  for (const section of ["dependencies", "devDependencies"] as const) {
    const block = pkg[section];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    for (const name of Object.keys(block)) {
      const lower = name.toLowerCase();
      for (const forbidden of PACKAGE_ELECTRON_FORBIDDEN) {
        if (lower === forbidden || lower.includes(forbidden)) {
          return GREENFIELD_VITE_ELECTRON_ERROR;
        }
      }
    }
  }
  const raw = content.toLowerCase();
  for (const forbidden of PACKAGE_ELECTRON_FORBIDDEN) {
    if (raw.includes(`"${forbidden}"`)) {
      return GREENFIELD_VITE_ELECTRON_ERROR;
    }
  }
  return null;
}

export function validateGreenfieldFiles(
  files: GeneratedFile[],
  opts?: { skipRepair?: boolean },
): { ok: boolean; errors: string[]; files: GeneratedFile[]; repairs: string[] } {
  const prepared = opts?.skipRepair
    ? { ok: true, files, errors: [], repairs: [] as string[] }
    : prepareGreenfieldFiles(files);
  if (!prepared.ok) {
    return {
      ok: false,
      errors: prepared.errors,
      files: prepared.files,
      repairs: prepared.repairs,
    };
  }

  const working = prepared.files;
  const present = presentPathSet(working);

  const pkg = working.find((f) => f.path === "package.json");
  if (!pkg) {
    return {
      ok: false,
      errors: ["Missing required file: package.json"],
      files: working,
      repairs: prepared.repairs,
    };
  }
  const pkgErr = validatePackageJsonContent(pkg.content);
  if (pkgErr) {
    return { ok: false, errors: [pkgErr], files: working, repairs: prepared.repairs };
  }

  const electronPkgErr = validatePackageJsonNoElectron(pkg.content);
  if (electronPkgErr) {
    return {
      ok: false,
      errors: [electronPkgErr],
      files: working,
      repairs: prepared.repairs,
    };
  }

  const viteConfig = working.find((f) => f.path === "vite.config.ts");
  if (!viteConfig) {
    return {
      ok: false,
      errors: ["Missing required file: vite.config.ts"],
      files: working,
      repairs: prepared.repairs,
    };
  }
  const viteErr = validateViteConfigContent(viteConfig.content);
  if (viteErr) {
    return { ok: false, errors: [viteErr], files: working, repairs: prepared.repairs };
  }

  const tsconfig = working.find((f) => f.path === "tsconfig.json");
  if (!tsconfig) {
    return {
      ok: false,
      errors: ["Missing required file: tsconfig.json"],
      files: working,
      repairs: prepared.repairs,
    };
  }
  const err = validateTsconfigContent(tsconfig.content, present);
  if (err) {
    return { ok: false, errors: [err], files: working, repairs: prepared.repairs };
  }
  return { ok: true, errors: [], files: working, repairs: prepared.repairs };
}
