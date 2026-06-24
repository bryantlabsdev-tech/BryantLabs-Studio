import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExecutionPlan } from "@/core/execution/executionPlan";
import type { PlanApplyTarget } from "@/core/planApply/collectTargets";
import type { ProjectScan } from "@/types";

function minimalScan(files: { path: string; abs: string }[]): ProjectScan {
  return {
    summary: {
      name: "test",
      framework: "react",
      language: "typescript",
      bundler: "Vite",
      totalFiles: files.length,
      totalFolders: 0,
      entryPoints: ["src/main.tsx"],
      packageManager: "npm",
      detections: {
        packageJson: true,
        tsconfig: true,
        viteConfig: true,
        electron: false,
        react: true,
        nextjs: false,
        node: false,
      },
    },
    files: files.map((f) => ({ path: f.path, absPath: f.abs })),
    index: files.map((f) => ({
      path: f.path,
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
    })),
    symbols: [],
    symbolGraph: [],
    repositoryStats: {
      totalFiles: files.length,
      totalComponents: 0,
      totalFunctions: 0,
      totalHooks: 0,
      totalClasses: 0,
      totalInterfaces: 0,
      totalTypes: 0,
      totalImports: 0,
      totalExports: 0,
    },
    dependencies: [],
    repositorySummary: "Project: test",
    scannedAt: Date.now(),
  };
}

describe("buildExecutionPlan", () => {
  it("orders auth-related steps: context → pages → routing → styles", () => {
    const scan = minimalScan([
      { path: "src/App.tsx", abs: "/p/src/App.tsx" },
      { path: "src/index.css", abs: "/p/src/index.css" },
    ]);
    const targets: PlanApplyTarget[] = [
      {
        relPath: "src/context/AuthContext.tsx",
        absPath: "/p/src/context/AuthContext.tsx",
        reason: "auth context",
        selectionReason: "ai",
        planReason: "Create AuthContext provider",
      },
      {
        relPath: "src/pages/Login.tsx",
        absPath: "/p/src/pages/Login.tsx",
        reason: "login page",
        selectionReason: "ai",
        planReason: "Create Login page",
      },
      {
        relPath: "src/App.tsx",
        absPath: "/p/src/App.tsx",
        reason: "routing",
        selectionReason: "ai",
        planReason: "Add protected routes",
      },
      {
        relPath: "src/index.css",
        absPath: "/p/src/index.css",
        reason: "styles",
        selectionReason: "ai",
        planReason: "Update styles",
      },
    ];

    const steps = buildExecutionPlan({
      prompt: "Add authentication",
      summary: "Auth flow",
      source: "ai",
      targets,
      plannedPaths: targets.map((t) => ({
        path: t.relPath,
        planReason: t.planReason,
      })),
      scan,
      projectRoot: "/p",
    });

    assert.ok(steps.length >= 3);
    const titles = steps.map((s) => s.title.toLowerCase());
    const contextIdx = titles.findIndex((t) => t.includes("context") || t.includes("auth"));
    const pagesIdx = titles.findIndex((t) => t.includes("page") || t.includes("login"));
    const routingIdx = titles.findIndex((t) => t.includes("routing") || t.includes("app"));
    assert.ok(contextIdx >= 0 && pagesIdx >= 0 && routingIdx >= 0);
    assert.ok(contextIdx < pagesIdx);
    assert.ok(pagesIdx < routingIdx);
  });
});
