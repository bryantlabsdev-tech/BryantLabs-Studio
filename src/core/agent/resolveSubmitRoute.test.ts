import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAgentSubmitRoute } from "@/core/agent/resolveSubmitRoute";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createLatestAction } from "@/core/greenfield/runLog";
import { mockProjectScan } from "@/core/repository/testScan";

const CREATE_PROMPT = "Build FieldFlow — field service management app with scheduling.";

describe("resolveAgentSubmitRoute", () => {
  it("blocks edit prompt on incomplete greenfield scaffold", () => {
    const projectPath = "/tmp/fieldflow";
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      runResult: "failed" as const,
      genStatus: "done",
      writeStatus: "done",
      setupStatus: "error",
      filesWritten: [
        "package.json",
        "src/App.tsx",
        "src/main.tsx",
        "src/index.css",
        "index.html",
        "tsconfig.json",
        "vite.config.ts",
      ],
      targetFolder: projectPath,
      projectPath,
      workflow: { prompt: CREATE_PROMPT },
      latestAction: createLatestAction("failed", "npm install failed", {
        stage: "npm_install",
      }),
    };

    const route = resolveAgentSubmitRoute({
      prompt: "Add dark mode toggle",
      projectOpen: true,
      projectPath,
      scan: mockProjectScan(run.filesWritten, { packageJson: true }),
      scanStatus: "done",
      greenfieldRun: run,
      fallbackSourceFileCount: run.filesWritten.length,
    });

    assert.equal(route.execution, "blocked");
    assert.match(route.blockedReason ?? "", /setup recovery/i);
  });

  it("routes same creation prompt to greenfield_recovery", () => {
    const projectPath = "/tmp/fieldflow";
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      runResult: "failed" as const,
      genStatus: "done",
      writeStatus: "done",
      setupStatus: "error",
      filesWritten: [
        "package.json",
        "src/App.tsx",
        "src/main.tsx",
        "src/index.css",
        "index.html",
        "tsconfig.json",
        "vite.config.ts",
      ],
      targetFolder: projectPath,
      projectPath,
      workflow: { prompt: CREATE_PROMPT },
      latestAction: createLatestAction("failed", "npm install failed", {
        stage: "npm_install",
      }),
    };

    const route = resolveAgentSubmitRoute({
      prompt: CREATE_PROMPT,
      projectOpen: true,
      projectPath,
      scan: mockProjectScan(run.filesWritten, { packageJson: true }),
      scanStatus: "done",
      greenfieldRun: run,
    });

    assert.equal(route.execution, "greenfield_recovery");
  });
});
