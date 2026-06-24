import { enrichProjectScan } from "@/core/repository/enrichScan";
import type { ProjectScan } from "@/types";

function inferScaffoldStack(paths: readonly string[]) {
  const hasNext = paths.some((p) => /next\.config\.(js|ts|mjs)$/i.test(p));
  const hasVite = paths.includes("vite.config.ts") || paths.includes("vite.config.js");
  const hasReact = paths.some((p) => p.endsWith(".tsx") || p.endsWith(".jsx"));

  if (hasNext) {
    return {
      framework: "Next.js",
      bundler: "Next.js",
      react: hasReact,
      nextjs: true,
      viteConfig: false,
    };
  }
  if (hasVite && hasReact) {
    return {
      framework: "React (Vite)",
      bundler: "Vite",
      react: true,
      nextjs: false,
      viteConfig: true,
    };
  }
  if (hasReact) {
    return { framework: "React", bundler: "Unknown", react: true, nextjs: false, viteConfig: hasVite };
  }
  return {
    framework: "Unknown",
    bundler: hasVite ? "Vite" : "Unknown",
    react: false,
    nextjs: false,
    viteConfig: hasVite,
  };
}

/** Minimal scan from known scaffold paths when the project index is not ready yet. */
export function buildScaffoldProjectScan(
  projectPath: string,
  filesWritten: readonly string[],
): ProjectScan | null {
  const root = projectPath.trim();
  if (!root || filesWritten.length === 0) return null;

  const paths = [...filesWritten];
  const stack = inferScaffoldStack(paths);
  const language =
    paths.some((p) => p.endsWith(".ts") || p.endsWith(".tsx")) ||
    paths.includes("tsconfig.json")
      ? "TypeScript"
      : "JavaScript";
  const index = paths.map((path) => ({
    path,
    imports: [],
    exports: [],
    components: [],
    functions: [],
    hooks: [],
    classes: [],
    interfaces: [],
    types: [],
    referencedNames: [],
    symbolLocations: [],
  }));

  return enrichProjectScan({
    scannedAt: Date.now(),
    summary: {
      name: root.split("/").pop() ?? "project",
      framework: stack.framework,
      language,
      bundler: stack.bundler,
      totalFiles: paths.length,
      totalFolders: 1,
      entryPoints: paths.includes("src/main.tsx")
        ? ["src/main.tsx"]
        : paths.includes("src/index.tsx")
          ? ["src/index.tsx"]
          : [],
      packageManager: "npm",
      detections: {
        packageJson: paths.includes("package.json"),
        tsconfig: paths.includes("tsconfig.json"),
        viteConfig: stack.viteConfig,
        electron: false,
        react: stack.react,
        nextjs: stack.nextjs,
        node: paths.some((p) => p.includes("server") || p.endsWith(".mjs")),
      },
    },
    files: paths.map((path) => ({
      path,
      absPath: `${root}/${path}`,
    })),
    index,
    symbols: [],
    symbolGraph: [],
    dependencies: [],
    repositorySummary: "",
    repositoryStats: {
      totalFiles: index.length,
      totalComponents: 0,
      totalFunctions: 0,
      totalHooks: 0,
      totalClasses: 0,
      totalInterfaces: 0,
      totalTypes: 0,
      totalImports: 0,
      totalExports: 0,
    },
  });
}
