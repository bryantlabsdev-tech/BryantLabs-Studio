import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePlan } from "@/core/planner";
import { computeRepositoryRelevance, searchRepository } from "@/core/repository";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { findSymbolReferences } from "@/core/repository/references";
import { isConfigArtifactPath } from "@/core/repository/config";
import { mockProjectScan } from "@/core/repository/testScan";

describe("repository relevance", () => {
  const scan = mockProjectScan(
    ["src/App.tsx", "src/index.css", "package.json", "vite.config.ts"],
    {
      index: [
        {
          path: "src/App.tsx",
          imports: ["./index.css"],
          exports: ["default"],
          components: ["App", "Calculator"],
          functions: [],
          hooks: [],
          classes: [],
          interfaces: [],
          types: [],
          referencedNames: ["Calculator"],
          symbolLocations: [],
        },
        {
          path: "src/index.css",
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
        },
        {
          path: "package.json",
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
        },
        {
          path: "vite.config.ts",
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
        },
      ],
      symbols: [
        {
          name: "Calculator",
          kind: "component",
          path: "src/App.tsx",
          absPath: "/project/src/App.tsx",
          line: 12,
        },
        {
          name: "App",
          kind: "component",
          path: "src/App.tsx",
          absPath: "/project/src/App.tsx",
          line: 8,
        },
      ],
    },
  );

  it("ranks App.tsx and index.css for premium calculator UI", () => {
    const rel = computeRepositoryRelevance(
      "Make calculator UI premium",
      scan,
    );
    const paths = rel.files.map((f) => f.path);
    assert.ok(paths.includes("src/App.tsx"));
    assert.ok(paths.includes("src/index.css"));
    assert.ok(!paths.includes("package.json"));
    assert.ok(!paths.includes("vite.config.ts"));
  });

  it("finds Calculator symbol via search", () => {
    const repo = buildRepositoryIndex(scan);
    const hits = searchRepository(repo, "Calculator");
    assert.ok(hits.some((h) => h.symbolName === "Calculator"));
    assert.ok(hits.some((h) => h.path === "src/App.tsx"));
  });

  it("generatePlan prefers repository targets over config files", () => {
    const plan = generatePlan("Make calculator premium", scan);
    const paths = plan.files.map((f) => f.path);
    assert.ok(paths.some((p) => p.endsWith("App.tsx")));
    assert.ok(paths.some((p) => p.endsWith("index.css")));
    assert.ok(!paths.includes("package.json"));
  });
});

describe("config artifact filter", () => {
  it("flags tooling paths", () => {
    assert.equal(isConfigArtifactPath("package.json"), true);
    assert.equal(isConfigArtifactPath("vite.config.ts"), true);
    assert.equal(isConfigArtifactPath("src/App.tsx"), false);
  });
});

describe("symbol search", () => {
  it("finds src/App.tsx when searching App", () => {
    const scan = mockProjectScan(["src/App.tsx"], {
      symbols: [
        {
          name: "App",
          kind: "component",
          path: "src/App.tsx",
          absPath: "/project/src/App.tsx",
          line: 1,
        },
      ],
    });
    const repo = buildRepositoryIndex(scan);
    const hits = searchRepository(repo, "App");
    assert.ok(hits.some((h) => h.path === "src/App.tsx"));
    const symHit = hits.find((h) => h.symbolName === "App");
    assert.ok(symHit);
    assert.equal(symHit!.line, 1);
  });

  it("ranks Dashboard symbol for dashboard prompts", () => {
    const scan = mockProjectScan(
      ["src/pages/Dashboard.tsx", "src/App.tsx"],
      {
        symbols: [
          {
            name: "Dashboard",
            kind: "component",
            path: "src/pages/Dashboard.tsx",
            absPath: "/project/src/pages/Dashboard.tsx",
            line: 5,
          },
        ],
      },
    );
    const rel = computeRepositoryRelevance("Improve the dashboard layout", scan);
    const paths = rel.files.map((f) => f.path);
    assert.ok(paths.some((p) => p.includes("Dashboard")));
  });
});

describe("findSymbolReferences", () => {
  it("returns graph references", () => {
    const scan = mockProjectScan(["src/Button.tsx", "src/App.tsx"], {
      index: [
        {
          path: "src/Button.tsx",
          imports: [],
          exports: ["Button"],
          components: ["Button"],
          functions: [],
          hooks: [],
          classes: [],
          interfaces: [],
          types: [],
          referencedNames: [],
          symbolLocations: [],
        },
        {
          path: "src/App.tsx",
          imports: ["./Button"],
          exports: [],
          components: ["App"],
          functions: [],
          hooks: [],
          classes: [],
          interfaces: [],
          types: [],
          referencedNames: ["Button"],
          symbolLocations: [],
        },
      ],
      symbols: [
        {
          name: "Button",
          kind: "component",
          path: "src/Button.tsx",
          absPath: "/project/src/Button.tsx",
          line: 3,
        },
      ],
    });
    const repo = buildRepositoryIndex(scan);
    const refs = findSymbolReferences(repo, "Button");
    assert.equal(refs.length, 1);
    assert.equal(refs[0]!.definedIn, "src/Button.tsx");
    assert.deepEqual(refs[0]!.usedIn, ["src/App.tsx"]);
  });
});
