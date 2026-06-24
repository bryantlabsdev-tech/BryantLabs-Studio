import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  artifactHasDiffContent,
  diffableFilesFromArtifact,
  diffableFilesFromRunDiffs,
  resolveSelectedDiffPath,
} from "@/core/agent/artifactDiffView";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";

function artifact(overrides: Partial<AgentRunArtifact> = {}): AgentRunArtifact {
  return {
    runId: "run-1",
    runNumber: 1,
    prompt: "Add dark mode",
    userMessageId: "chat-1",
    startedAt: 1000,
    endedAt: 2000,
    durationMs: 1000,
    outcome: "success",
    provider: null,
    model: null,
    filesModified: ["src/App.tsx"],
    fileDiffs: [
      {
        path: "src/App.tsx",
        linesAdded: 4,
        linesRemoved: 1,
        preview: [],
        before: "const x = 1;",
        after: "const x = 2;",
      },
    ],
    card: {} as AgentRunArtifact["card"],
    dashboard: {} as AgentRunArtifact["dashboard"],
    timeline: null,
    ...overrides,
  };
}

describe("artifactDiffView", () => {
  it("lists full diff files from artifact fileDiffs", () => {
    const files = diffableFilesFromArtifact(artifact());
    assert.equal(files.length, 1);
    assert.equal(files[0]?.hasFullDiff, true);
    assert.equal(files[0]?.before, "const x = 1;");
  });

  it("falls back to filesModified when fileDiffs empty", () => {
    const files = diffableFilesFromArtifact(
      artifact({ fileDiffs: [], filesModified: ["src/index.css"] }),
    );
    assert.deepEqual(files.map((file) => file.path), ["src/index.css"]);
    assert.equal(files[0]?.hasFullDiff, false);
  });

  it("detects diff content", () => {
    assert.equal(artifactHasDiffContent(artifact()), true);
    assert.equal(
      artifactHasDiffContent(artifact({ fileDiffs: [], filesModified: ["src/index.css"] })),
      false,
    );
    assert.equal(
      artifactHasDiffContent(artifact({ fileDiffs: [], filesModified: [] })),
      false,
    );
  });

  it("maps run file diffs to workbench file views", () => {
    const files = diffableFilesFromRunDiffs([
      {
        path: "src/App.tsx",
        linesAdded: 2,
        linesRemoved: 1,
        preview: [],
        before: "a",
        after: "b",
      },
    ]);
    assert.equal(files[0]?.hasFullDiff, true);
    assert.equal(files[0]?.path, "src/App.tsx");
  });

  it("resolveSelectedDiffPath prefers valid preferred path", () => {
    const files = diffableFilesFromArtifact(artifact());
    assert.equal(resolveSelectedDiffPath(files, "src/App.tsx"), "src/App.tsx");
    assert.equal(resolveSelectedDiffPath(files, "missing.ts"), "src/App.tsx");
  });
});
