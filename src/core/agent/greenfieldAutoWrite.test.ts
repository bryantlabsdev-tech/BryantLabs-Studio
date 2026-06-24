import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveGreenfieldAutoWriteDecision } from "@/core/agent/greenfieldAutoWrite";
import { buildGreenfieldFallbackSkeleton } from "@/core/greenfield/fallbackSkeleton";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";

describe("greenfieldAutoWrite", () => {
  it("blocks skeleton placeholder apps", () => {
    const skeleton = buildGreenfieldFallbackSkeleton("Build notes app");
    const decision = resolveGreenfieldAutoWriteDecision(skeleton, "Build notes app");
    assert.equal(decision.ready, false);
    assert.equal(decision.skeletonDetected, true);
  });

  it("allows complete non-skeleton file sets", () => {
    const files = GREENFIELD_FILE_PATHS.map((path) => ({
      path,
      content:
        path === "src/App.tsx"
          ? `export default function App() {
  return <main><h1>Notes</h1><p>Capture ideas</p></main>;
}`
          : "// file",
    }));
    const decision = resolveGreenfieldAutoWriteDecision(files, "Build notes app");
    assert.equal(decision.ready, true);
    assert.equal(decision.skeletonDetected, false);
  });

  it("fills partial parses when missing files can be recovered", () => {
    const partial = GREENFIELD_FILE_PATHS.filter(
      (path) => path !== "vite.config.ts" && path !== "src/index.css",
    ).map((path) => ({
      path,
      content:
        path === "src/App.tsx"
          ? "export default function App(){return <main><h1>Game</h1></main>;}"
          : "// x",
    }));
    const decision = resolveGreenfieldAutoWriteDecision(partial, "Build a game");
    assert.equal(decision.ready, true);
    assert.equal(decision.completedViaFill, true);
    assert.equal(decision.files?.length, GREENFIELD_FILE_PATHS.length);
  });

  it("blocks multi-phase auto-write when page components are missing", () => {
    const decision = resolveGreenfieldAutoWriteDecision(
      [{ path: "src/App.tsx", content: "export default function App(){return <div/>}" }],
      "FieldFlow",
      {
        generationMode: "multi-phase",
        projectFiles: [
          { path: "src/App.tsx", content: "export default function App(){return <div/>}" },
          { path: "src/pages/Dashboard.tsx", content: "export default function Dashboard(){return <div/>}" },
        ],
        manifestPages: ["Dashboard", "Leads", "Jobs"],
      },
    );
    assert.equal(decision.ready, false);
    assert.match(decision.reason ?? "", /missing 2 page/i);
  });
});
