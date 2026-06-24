import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGreenfieldFallbackSourceFileCount,
  GREENFIELD_EMPTY_FOLDER_ACTIVITY,
  isEmptyProjectFolder,
  NO_FOLDER_GREENFIELD_MESSAGE,
  resolveAgentSourceFileCount,
} from "@/core/agent/agentGreenfieldDispatch";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";

describe("agentGreenfieldDispatch", () => {
  it("ignores stale filesWritten from a different project folder", () => {
    const run = {
      ...emptyGreenfieldRun(),
      filesWritten: ["src/App.tsx"],
      targetFolder: "/old/project",
    };
    assert.equal(
      buildGreenfieldFallbackSourceFileCount(run, "/new/empty"),
      undefined,
    );
  });

  it("uses filesWritten fallback when scaffold markers exist", () => {
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "success" as const,
      filesWritten: ["package.json", "index.html", "src/App.tsx"],
      targetFolder: "/other/path",
    };
    assert.equal(
      buildGreenfieldFallbackSourceFileCount(run, "/new/project"),
      3,
    );
  });

  it("detects empty project folders", () => {
    assert.equal(
      isEmptyProjectFolder({ scan: null, scanStatus: "idle" }),
      true,
    );
  });

  it("uses fallback over stale empty scan with scanStatus done", () => {
    const scan = mockProjectScan([], { packageJson: false });
    assert.equal(
      resolveAgentSourceFileCount({
        scan,
        scanStatus: "done",
        fallbackSourceFileCount: 7,
      }),
      7,
    );
    assert.equal(
      isEmptyProjectFolder({
        scan,
        scanStatus: "done",
        fallbackSourceFileCount: 7,
      }),
      false,
    );
  });

  it("exports greenfield activity copy", () => {
    assert.match(GREENFIELD_EMPTY_FOLDER_ACTIVITY, /empty folder/i);
    assert.match(NO_FOLDER_GREENFIELD_MESSAGE, /empty folder/i);
  });
});
