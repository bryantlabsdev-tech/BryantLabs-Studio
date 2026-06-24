export interface PackageJsonSanitizeResult {
  readonly content: string;
  readonly repairs: readonly string[];
  readonly changed: boolean;
}

export interface EtargetPackageRef {
  readonly packageName: string;
  readonly version: string;
}

interface ObsoleteTypesRule {
  readonly typesPackage: string;
  readonly runtimePackage: string;
  readonly minRuntimeMajor: number;
}

/** @types packages to drop when the runtime library ships its own types. */
const OBSOLETE_TYPINGS_RULES: readonly ObsoleteTypesRule[] = [
  {
    typesPackage: "@types/react-router-dom",
    runtimePackage: "react-router-dom",
    minRuntimeMajor: 6,
  },
  {
    typesPackage: "@types/react-router",
    runtimePackage: "react-router",
    minRuntimeMajor: 6,
  },
];

/** @types packages that are never needed alongside their runtime counterpart. */
const BUNDLED_TYPES_PACKAGES: readonly string[] = ["@types/vite"];

export function parseMajorVersion(version: string): number | null {
  const trimmed = version.trim().replace(/^[\^~<>=\s]+/, "");
  const match = trimmed.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function readDepBlock(
  pkg: Record<string, unknown>,
  section: "dependencies" | "devDependencies",
): Record<string, string> {
  const block = pkg[section];
  if (!block || typeof block !== "object" || Array.isArray(block)) return {};
  const out: Record<string, string> = {};
  for (const [name, version] of Object.entries(block)) {
    if (typeof version === "string") out[name] = version;
  }
  return out;
}

function writeDepBlock(
  pkg: Record<string, unknown>,
  section: "dependencies" | "devDependencies",
  block: Record<string, string>,
): void {
  if (Object.keys(block).length === 0) {
    delete pkg[section];
    return;
  }
  pkg[section] = block;
}

function runtimeMajor(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  runtimePackage: string,
  fallbackMajor: number,
): number | null {
  const version = deps[runtimePackage] ?? devDeps[runtimePackage];
  if (!version) return fallbackMajor;
  return parseMajorVersion(version);
}

export function sanitizePackageJsonContent(content: string): PackageJsonSanitizeResult {
  const repairs: string[] = [];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { content, repairs: [], changed: false };
  }

  const deps = readDepBlock(parsed, "dependencies");
  const devDeps = readDepBlock(parsed, "devDependencies");

  for (const rule of OBSOLETE_TYPINGS_RULES) {
    if (!(rule.typesPackage in devDeps)) continue;
    const major = runtimeMajor(deps, devDeps, rule.runtimePackage, rule.minRuntimeMajor);
    if (major == null || major >= rule.minRuntimeMajor) {
      delete devDeps[rule.typesPackage];
      repairs.push(
        `Removed obsolete ${rule.typesPackage} (${rule.runtimePackage} v${major ?? rule.minRuntimeMajor}+ includes TypeScript types)`,
      );
    }
  }

  for (const typesPackage of BUNDLED_TYPES_PACKAGES) {
    if (!(typesPackage in devDeps)) continue;
    const runtimePackage = typesPackage.replace(/^@types\//, "");
    if (deps[runtimePackage] || devDeps[runtimePackage]) {
      delete devDeps[typesPackage];
      repairs.push(`Removed obsolete ${typesPackage} (${runtimePackage} ships its own types)`);
    }
  }

  if (repairs.length === 0) {
    return { content, repairs: [], changed: false };
  }

  writeDepBlock(parsed, "dependencies", deps);
  writeDepBlock(parsed, "devDependencies", devDeps);
  return {
    content: `${JSON.stringify(parsed, null, 2)}\n`,
    repairs,
    changed: true,
  };
}

export function removePackageFromPackageJson(
  content: string,
  packageName: string,
): PackageJsonSanitizeResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { content, repairs: [], changed: false };
  }

  const deps = readDepBlock(parsed, "dependencies");
  const devDeps = readDepBlock(parsed, "devDependencies");
  const repairs: string[] = [];

  if (packageName in deps) {
    delete deps[packageName];
    repairs.push(`Removed unavailable dependency ${packageName}`);
  }
  if (packageName in devDeps) {
    delete devDeps[packageName];
    repairs.push(`Removed unavailable devDependency ${packageName}`);
  }

  if (repairs.length === 0) {
    return { content, repairs: [], changed: false };
  }

  writeDepBlock(parsed, "dependencies", deps);
  writeDepBlock(parsed, "devDependencies", devDeps);
  const sanitized = sanitizePackageJsonContent(`${JSON.stringify(parsed, null, 2)}\n`);
  return {
    content: sanitized.content,
    repairs: [...repairs, ...sanitized.repairs],
    changed: true,
  };
}

export function isNpmEtargetFailure(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return /(?:npm ERR! code ETARGET|code ETARGET|No matching version found for)/i.test(combined);
}

export function parseEtargetPackage(stdout: string, stderr: string): EtargetPackageRef | null {
  const combined = `${stdout}\n${stderr}`;
  const match = combined.match(
    /No matching version found for (@?[A-Za-z0-9._\-/]+?)@(\S+)/i,
  );
  if (!match) return null;
  const version = match[2]!.replace(/[.,;]+$/, "");
  return { packageName: match[1]!, version };
}

export function sanitizePackageJsonInFiles<
  T extends { readonly path: string; readonly content: string },
>(files: readonly T[]): { files: T[]; repairs: string[] } {
  const repairs: string[] = [];
  const next = files.map((file) => {
    if (file.path !== "package.json") return file;
    const sanitized = sanitizePackageJsonContent(file.content);
    if (sanitized.changed) repairs.push(...sanitized.repairs);
    return sanitized.changed ? { ...file, content: sanitized.content } : file;
  });
  return { files: next, repairs };
}
