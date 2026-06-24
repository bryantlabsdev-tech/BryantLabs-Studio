import { enrichProjectScan } from "@/core/repository/enrichScan";
import type { FileIndex, ProjectScan, SymbolEntry } from "@/types";

export function mockProjectScan(
  paths: string[],
  opts?: {
    root?: string;
    index?: FileIndex[];
    symbols?: SymbolEntry[];
    packageJson?: boolean;
  },
): ProjectScan {
  const root = opts?.root ?? "/project";
  const index =
    opts?.index ??
    paths.map((path) => ({
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
      name: "test",
      framework: "React (Vite)",
      language: "TypeScript",
      bundler: "Vite",
      totalFiles: paths.length,
      totalFolders: 1,
      entryPoints: ["src/main.tsx"],
      packageManager: "npm",
      detections: {
        packageJson:
          opts?.packageJson ??
          (paths.includes("package.json") || paths.length > 0),
        tsconfig: true,
        viteConfig: true,
        electron: false,
        react: true,
        nextjs: false,
        node: false,
      },
    },
    files: paths.map((path) => ({
      path,
      absPath: `${root}/${path}`,
    })),
    index,
      symbols:
        opts?.symbols ??
        [],
    symbolGraph: [],
    dependencies: [
      { name: "react", version: "^18.0.0", kind: "dependencies" },
      { name: "vite", version: "^5.0.0", kind: "devDependencies" },
    ],
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
