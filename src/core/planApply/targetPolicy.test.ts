import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENTRY_BOOTSTRAP_SKIP_MESSAGE,
  filterPlanApplyTargets,
  isEntryBootstrapPath,
  isGameplayPatchTarget,
} from "@/core/planApply/targetPolicy";
import { mockProjectScan } from "@/core/repository/testScan";

describe("isEntryBootstrapPath", () => {
  it("identifies Vite/React mount stubs", () => {
    assert.equal(isEntryBootstrapPath("src/main.tsx"), true);
    assert.equal(isEntryBootstrapPath("src/main.ts"), true);
    assert.equal(isEntryBootstrapPath("src/index.tsx"), true);
    assert.equal(isEntryBootstrapPath("src/index.js"), true);
  });

  it("does not treat App.tsx or CSS as bootstrap", () => {
    assert.equal(isEntryBootstrapPath("src/App.tsx"), false);
    assert.equal(isEntryBootstrapPath("src/index.css"), false);
  });
});

describe("isGameplayPatchTarget", () => {
  it("allows App entry and styles", () => {
    assert.equal(isGameplayPatchTarget("src/App.tsx"), true);
    assert.equal(isGameplayPatchTarget("src/index.css"), true);
  });

  it("does not treat bootstrap files as gameplay targets", () => {
    assert.equal(isGameplayPatchTarget("src/main.tsx"), false);
    assert.equal(isGameplayPatchTarget("src/index.tsx"), false);
  });
});

describe("filterPlanApplyTargets bootstrap exclusion", () => {
  it("skips main.tsx for functional feature prompts", () => {
    const scan = mockProjectScan(["src/App.tsx", "src/main.tsx", "src/index.css"]);
    const skipped: string[] = [];
    const kept = filterPlanApplyTargets(
      [
        {
          relPath: "src/App.tsx",
          absPath: "/p/src/App.tsx",
          planReason: "app",
          selectionReason: "app",
        },
        {
          relPath: "src/main.tsx",
          absPath: "/p/src/main.tsx",
          planReason: "boot",
          selectionReason: "boot",
        },
      ],
      scan,
      "Add priority levels and due dates to tasks.",
      skipped,
    );
    assert.deepEqual(
      kept.map((t) => t.relPath),
      ["src/App.tsx"],
    );
    assert.ok(skipped.some((s) => s.includes("src/main.tsx") && s.includes(ENTRY_BOOTSTRAP_SKIP_MESSAGE)));
  });
});
