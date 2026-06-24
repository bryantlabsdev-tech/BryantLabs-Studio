import { collectConfigReferences, parseJsonWithComments } from "@/core/greenfield/configRefs";
import {
  GREENFIELD_FILE_PATHS,
  type GeneratedFile,
  type GreenfieldFilePath,
} from "@/core/greenfield/types";

export interface GreenfieldProjectValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly missingFiles: readonly GreenfieldFilePath[];
  readonly malformedMarkers: readonly GreenfieldFilePath[];
  readonly files: GeneratedFile[];
}

function presentPathSet(files: readonly GeneratedFile[]): Set<string> {
  return new Set(files.map((f) => f.path));
}

export function validateRequiredProjectFiles(
  files: readonly GeneratedFile[],
): GreenfieldProjectValidation {
  const errors: string[] = [];
  const missingFiles: GreenfieldFilePath[] = [];
  const map = new Map(files.map((f) => [f.path, f.content]));

  for (const path of GREENFIELD_FILE_PATHS) {
    if (!map.has(path) || !map.get(path)!.trim()) {
      missingFiles.push(path);
      errors.push(`Missing required file: ${path}`);
    }
  }

  const packageJson = map.get("package.json");
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as Record<string, unknown>;
      if (!pkg.scripts || typeof pkg.scripts !== "object") {
        errors.push("package.json must include scripts");
      }
      const scripts = pkg.scripts as Record<string, unknown>;
      for (const script of ["dev", "build", "typecheck", "preview"]) {
        if (typeof scripts[script] !== "string") {
          errors.push(`package.json missing script: ${script}`);
        }
      }
    } catch {
      errors.push("package.json is not valid JSON");
    }
  }

  const mainTsx = map.get("src/main.tsx");
  const appTsx = map.get("src/App.tsx");
  const indexHtml = map.get("index.html");
  if (mainTsx && !/createRoot|ReactDOM|render/i.test(mainTsx)) {
    errors.push("src/main.tsx does not appear to mount a React root");
  }
  if (mainTsx && appTsx && !/from\s+["']\.\/App["']|from\s+["']\.\/App\.tsx["']/.test(mainTsx)) {
    errors.push("src/main.tsx must import App from ./App");
  }
  if (indexHtml && !indexHtml.includes('id="root"')) {
    errors.push("index.html missing #root mount point");
  }
  if (indexHtml && !indexHtml.includes("/src/main.tsx")) {
    errors.push("index.html must load /src/main.tsx");
  }

  const tsconfig = map.get("tsconfig.json");
  const present = presentPathSet(files);
  if (tsconfig) {
    try {
      const parsed = parseJsonWithComments(tsconfig) as Record<string, unknown>;
      const refs = collectConfigReferences(parsed);
      for (const ref of refs) {
        if (!present.has(ref) && !GREENFIELD_FILE_PATHS.includes(ref as GreenfieldFilePath)) {
          errors.push(`tsconfig.json references missing file: ${ref}`);
        }
      }
    } catch {
      errors.push("tsconfig.json is not valid JSON");
    }
  }

  const ordered = GREENFIELD_FILE_PATHS.filter((p) => map.has(p)).map((path) => ({
    path,
    content: map.get(path)!,
  }));

  return {
    ok: errors.length === 0 && missingFiles.length === 0,
    errors,
    missingFiles,
    malformedMarkers: missingFiles,
    files: ordered,
  };
}

export function validateGreenfieldProject(
  files: readonly GeneratedFile[] | null,
  markerMissing?: readonly GreenfieldFilePath[],
): GreenfieldProjectValidation {
  if (!files || files.length === 0) {
    return {
      ok: false,
      errors: ["No generated files parsed from provider response"],
      missingFiles: markerMissing ?? [...GREENFIELD_FILE_PATHS],
      malformedMarkers: markerMissing ?? [...GREENFIELD_FILE_PATHS],
      files: [],
    };
  }
  const result = validateRequiredProjectFiles(files);
  if (markerMissing?.length) {
    const map = new Map(files.map((f) => [f.path, f.content]));
    const markerOnlyMissing = markerMissing.filter(
      (path) => !map.has(path) || !map.get(path)!.trim(),
    );
    const mergedMissing = [
      ...new Set([...result.missingFiles, ...markerOnlyMissing]),
    ] as GreenfieldFilePath[];
    return {
      ...result,
      ok: result.ok && mergedMissing.length === 0,
      missingFiles: mergedMissing,
      malformedMarkers: markerOnlyMissing,
      errors:
        markerOnlyMissing.length > 0
          ? [
              ...result.errors,
              `Malformed or missing markers for: ${markerOnlyMissing.join(", ")}`,
            ]
          : result.errors,
    };
  }
  return result;
}
