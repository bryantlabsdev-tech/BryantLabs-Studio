import type { GeneratedFile } from "./generate.cjs";
import {
  collectConfigReferences,
  parseJsonWithComments,
} from "./configRefs.cjs";
import {
  GREENFIELD_REPAIRABLE_REFERENCES,
  type GeneratedFilePath,
} from "./paths.cjs";
import { sanitizePackageJsonInFiles } from "./packageJsonSanitizer.cjs";

export const DEFAULT_TSCONFIG_NODE_JSON = `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
`;

export function GREENFIELD_CONFIG_REF_UNKNOWN_ERROR(ref: string): string {
  return `Generated configuration references unknown file: ${ref}`;
}

function logConfigReference(ref: string): void {
  console.log(`[parser:config_reference] tsconfig.json references ${ref}`);
}

function logRepairCreated(ref: string): void {
  console.log(`[parser:repair] created ${ref}`);
}

function logRepairSuccess(): void {
  console.log("[parser:repair:success]");
}

export function defaultTsconfigNodeContent(): string {
  return DEFAULT_TSCONFIG_NODE_JSON;
}

export function findMissingConfigReferences(
  files: readonly GeneratedFile[],
): string[] {
  const present = new Set(files.map((f) => f.path));
  const missing = new Set<string>();

  for (const file of files) {
    if (file.path !== "tsconfig.json") continue;
    let parsed: unknown;
    try {
      parsed = parseJsonWithComments(file.content);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    for (const ref of collectConfigReferences(parsed as Record<string, unknown>)) {
      if (!present.has(ref as GeneratedFilePath)) missing.add(ref);
    }
  }

  return [...missing];
}

export function repairGreenfieldConfigReferences(
  files: GeneratedFile[],
): { files: GeneratedFile[]; repairs: string[]; errors: string[] } {
  const repairs: string[] = [];
  const errors: string[] = [];
  let next = [...files];
  const missing = findMissingConfigReferences(next);

  for (const ref of missing) {
    if (ref === "tsconfig.node.json") {
      logConfigReference(ref);
      if (!next.some((f) => f.path === "tsconfig.node.json")) {
        next = [
          ...next,
          { path: "tsconfig.node.json", content: defaultTsconfigNodeContent() },
        ];
        repairs.push("tsconfig.node.json");
        logRepairCreated(ref);
      }
      continue;
    }

    if (!GREENFIELD_REPAIRABLE_REFERENCES.has(ref)) {
      errors.push(GREENFIELD_CONFIG_REF_UNKNOWN_ERROR(ref));
    }
  }

  if (repairs.length > 0) {
    logRepairSuccess();
  }

  return { files: next, repairs, errors };
}

export function prepareGreenfieldFiles(
  files: GeneratedFile[],
): { ok: boolean; files: GeneratedFile[]; errors: string[]; repairs: string[] } {
  const required = ["package.json", "src/main.tsx", "src/App.tsx"] as const;
  const paths = new Set(files.map((f) => f.path));
  const errors: string[] = [];

  for (const req of required) {
    if (!paths.has(req)) {
      errors.push(`Missing required file: ${req}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, files, errors, repairs: [] };
  }

  const repaired = repairGreenfieldConfigReferences(files);
  if (repaired.errors.length > 0) {
    return {
      ok: false,
      files: repaired.files,
      errors: repaired.errors,
      repairs: repaired.repairs,
    };
  }

  const sanitized = sanitizePackageJsonInFiles(repaired.files);
  const repairs = [...repaired.repairs, ...sanitized.repairs];

  return {
    ok: true,
    files: sanitized.files,
    errors: [],
    repairs,
  };
}
