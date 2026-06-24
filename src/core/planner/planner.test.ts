import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePlan } from "@/core/planner";
import { mockProjectScan } from "@/core/repository/testScan";

function mockScan(paths: string[], root = "/project") {
  return mockProjectScan(paths, {
    root,
    index: paths.map((path) => ({
      path,
      imports: path.endsWith("App.tsx") ? ["./index.css"] : [],
      components: path.endsWith("App.tsx") ? ["App"] : [],
      functions: [],
      exports: [],
      hooks: [],
      classes: [],
      interfaces: [],
      types: [],
      referencedNames: path.endsWith("App.tsx") ? ["App"] : [],
      symbolLocations: [],
    })),
    symbols: paths.some((p) => p.endsWith("App.tsx"))
      ? [
          {
            name: "App",
            kind: "component" as const,
            path: "src/App.tsx",
            absPath: `${root}/src/App.tsx`,
            line: 1,
          },
        ]
      : [],
  });
}

describe("generatePlan UI fallback", () => {
  it("selects App.tsx and index.css for premium calculator UI prompts", () => {
    const scan = mockScan([
      "src/App.tsx",
      "src/index.css",
      "src/main.tsx",
      "package.json",
    ]);
    const plan = generatePlan(
      "Upgrade this calculator UI into a premium modern calculator.",
      scan,
    );

    assert.ok(plan.files.length > 0, "should never return zero files");
    const paths = plan.files.map((f) => f.path);
    assert.ok(
      paths.some((p) => p.endsWith("App.tsx")),
      `expected App.tsx in ${paths.join(", ")}`,
    );
    assert.ok(
      paths.some((p) => p.endsWith("index.css")),
      `expected index.css in ${paths.join(", ")}`,
    );
    assert.ok(
      plan.files.some((f) =>
        f.reasons.some((r) => /React entry|Primary stylesheet|Calculator/i.test(r)),
      ),
      "expected human-readable selection reasons",
    );
  });

  it("returns empty files and guidance when project scan has no files", () => {
    const scan = mockScan([]);
    const plan = generatePlan("Build a calculator app", scan);
    assert.equal(plan.files.length, 0);
    assert.match(plan.summary, /No project files found/i);
  });

  it("uses fallback summary when keyword scoring finds nothing", () => {
    const scan = mockScan(["src/App.tsx", "src/index.css", "README.md"]);
    const plan = generatePlan("Improve zzxywq module internals", scan);

    assert.ok(plan.files.length > 0);
    assert.match(plan.summary, /fallback file selection/i);
    assert.equal(plan.files[0]?.path, "src/App.tsx");
  });
});
