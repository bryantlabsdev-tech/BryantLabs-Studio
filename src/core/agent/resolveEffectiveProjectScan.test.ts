import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEffectiveProjectScan } from "@/core/agent/resolveEffectiveProjectScan";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";

describe("resolveEffectiveProjectScan", () => {
  it("returns a fresh populated scan", () => {
    const scan = mockProjectScan(["src/App.tsx", "src/index.css"]);
    assert.equal(
      resolveEffectiveProjectScan({
        scan,
        projectPath: "/tmp/app",
        greenfieldRun: emptyGreenfieldRun(),
      }),
      scan,
    );
  });

  it("keeps a cached populated scan even when persisted files exist", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    assert.equal(
      resolveEffectiveProjectScan({
        scan,
        projectPath: "/tmp/app",
        greenfieldRun: emptyGreenfieldRun(),
        persistedModifiedFiles: ["src/Other.tsx"],
      }),
      scan,
    );
  });

  it("builds scaffold scan from filesWritten when scan is null", () => {
    const run = {
      ...emptyGreenfieldRun(),
      filesWritten: ["package.json", "src/App.tsx"],
    };
    const effective = resolveEffectiveProjectScan({
      scan: null,
      projectPath: "/tmp/app",
      greenfieldRun: run,
    });
    assert.ok(effective);
    assert.equal(effective?.files.length, 2);
    assert.equal(effective?.files[0]?.absPath, "/tmp/app/package.json");
  });

  it("replaces a stale empty cached scan using in-memory filesWritten", () => {
    const stale = mockProjectScan([], { packageJson: false });
    const effective = resolveEffectiveProjectScan({
      scan: stale,
      projectPath: "/tmp/app",
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        filesWritten: ["src/App.tsx"],
      },
    });
    assert.ok(effective);
    assert.notEqual(effective, stale);
    assert.equal(effective?.files[0]?.path, "src/App.tsx");
  });

  it("replaces stale empty cached scan with persisted modified files after reopen", () => {
    const stale = mockProjectScan([], { packageJson: false });
    const effective = resolveEffectiveProjectScan({
      scan: stale,
      projectPath: "/tmp/app",
      greenfieldRun: emptyGreenfieldRun(),
      persistedModifiedFiles: ["src/App.tsx", "src/index.css"],
    });
    assert.ok(effective);
    assert.equal(effective?.files.length, 2);
    assert.equal(effective?.files[0]?.path, "src/App.tsx");
  });

  it("returns the stale empty scan when no fallback paths exist", () => {
    const stale = mockProjectScan([], { packageJson: false });
    assert.equal(
      resolveEffectiveProjectScan({
        scan: stale,
        projectPath: "/tmp/app",
        greenfieldRun: emptyGreenfieldRun(),
      }),
      stale,
    );
  });
});
