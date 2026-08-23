import { joinProjectPath } from "@/monaco/projectPaths";

/** Type definition files Monaco needs to resolve `react` / Vite apps. */
export const MONACO_PROJECT_TYPE_LIB_RELS = [
  "node_modules/@types/react/package.json",
  "node_modules/@types/react/index.d.ts",
  "node_modules/@types/react/global.d.ts",
  "node_modules/@types/react/jsx-runtime.d.ts",
  "node_modules/@types/react/jsx-dev-runtime.d.ts",
  "node_modules/@types/react-dom/package.json",
  "node_modules/@types/react-dom/index.d.ts",
  "node_modules/@types/react-dom/client.d.ts",
  "node_modules/csstype/package.json",
  "node_modules/csstype/index.d.ts",
  "node_modules/vite/package.json",
  "node_modules/vite/client.d.ts",
  "node_modules/vite/dist/node/index.d.ts",
  "node_modules/@vitejs/plugin-react/package.json",
  "node_modules/@vitejs/plugin-react/dist/index.d.ts",
] as const;

/**
 * Compiler `paths` relative to the project `baseUrl`.
 * Absolute values are ignored by Monaco's TS worker, which is why
 * `Cannot find module 'react'` appears even after extraLibs load.
 */
export function monacoReactCompilerPaths(
  _projectPath?: string,
): Record<string, string[]> {
  return {
    react: ["node_modules/@types/react/index.d.ts"],
    "react/jsx-runtime": ["node_modules/@types/react/jsx-runtime.d.ts"],
    "react/jsx-dev-runtime": ["node_modules/@types/react/jsx-dev-runtime.d.ts"],
    "react-dom": ["node_modules/@types/react-dom/index.d.ts"],
    "react-dom/client": ["node_modules/@types/react-dom/client.d.ts"],
    csstype: ["node_modules/csstype/index.d.ts"],
    vite: ["node_modules/vite/dist/node/index.d.ts"],
    "@vitejs/plugin-react": ["node_modules/@vitejs/plugin-react/dist/index.d.ts"],
  };
}

export interface MonacoTypeLibSpec {
  readonly relPath: string;
  readonly absPath: string;
}

/** Map a project-relative type lib onto an absolute path for Monaco extra libs. */
export function monacoTypeLibSpec(
  projectPath: string,
  relPath: string,
): MonacoTypeLibSpec {
  return {
    relPath: relPath.replace(/\\/g, "/"),
    absPath: joinProjectPath(projectPath, relPath),
  };
}

export function monacoProjectTypeLibSpecs(projectPath: string): MonacoTypeLibSpec[] {
  return MONACO_PROJECT_TYPE_LIB_RELS.map((rel) => monacoTypeLibSpec(projectPath, rel));
}

/**
 * Load only type packages that the project actually depends on.
 * Always include Vite client types when a Vite app is present (tsconfig types).
 */
export function selectMonacoTypeLibs(
  specs: readonly MonacoTypeLibSpec[],
  packageJsonText: string | null,
): MonacoTypeLibSpec[] {
  const raw = packageJsonText?.trim() ?? "";
  let deps = new Set<string>();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      deps = new Set([
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {}),
        ...Object.keys(parsed.peerDependencies ?? {}),
      ]);
    } catch {
      deps = new Set();
    }
  }

  const wantsReact = deps.size === 0 || deps.has("react") || deps.has("@types/react");
  const wantsReactDom =
    deps.size === 0 || deps.has("react-dom") || deps.has("@types/react-dom");
  const wantsVite = deps.size === 0 || deps.has("vite") || deps.has("@vitejs/plugin-react");

  return specs.filter((spec) => {
    if (spec.relPath.includes("@types/react-dom")) return wantsReactDom;
    if (spec.relPath.includes("@types/react") || spec.relPath.includes("csstype")) {
      return wantsReact;
    }
    if (
      spec.relPath.includes("node_modules/vite/") ||
      spec.relPath.includes("@vitejs/plugin-react")
    ) {
      return wantsVite;
    }
    return true;
  });
}
