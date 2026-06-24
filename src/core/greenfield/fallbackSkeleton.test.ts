import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGreenfieldFallbackSkeleton,
  buildCriticalAppScaffold,
  fillMissingGreenfieldFiles,
  isFallbackSkeletonAppContent,
} from "@/core/greenfield/fallbackSkeleton";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";

const FIELD_FLOW_APP = `import { BrowserRouter, Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <div className="flex min-h-screen bg-slate-900 text-white">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<h1>FieldFlow</h1>} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}`;

describe("greenfield fallback skeleton", () => {
  it("creates all seven scaffold files", () => {
    const files = buildGreenfieldFallbackSkeleton("Build a FieldFlow app");
    assert.equal(files.length, GREENFIELD_FILE_PATHS.length);
    assert.ok(files.every((f) => f.content.trim().length > 0));
    assert.ok(files.find((f) => f.path === "src/App.tsx")?.content.includes("FieldFlow"));
  });

  it("fills only missing paths", () => {
    const existing = buildGreenfieldFallbackSkeleton().filter(
      (f) => f.path === "package.json" || f.path === "index.html",
    );
    const filled = fillMissingGreenfieldFiles(existing, [
      "src/main.tsx",
      "src/App.tsx",
    ], undefined, { allowCriticalSkeleton: true });
    assert.equal(filled.files.length, GREENFIELD_FILE_PATHS.length);
    assert.equal(
      filled.files.find((f) => f.path === "package.json")?.content,
      existing.find((f) => f.path === "package.json")?.content,
    );
  });

  it("prefers recovered App.tsx partial content over skeleton", () => {
    const existing = buildGreenfieldFallbackSkeleton().filter(
      (f) => f.path !== "src/App.tsx",
    );
    const filled = fillMissingGreenfieldFiles(
      existing,
      ["src/App.tsx"],
      "Build FieldFlow",
      {
        recoveredPartials: { "src/App.tsx": FIELD_FLOW_APP },
        allowCriticalSkeleton: false,
      },
    );
    const app = filled.files.find((f) => f.path === "src/App.tsx");
    assert.ok(app);
    assert.match(app.content, /FieldFlow/);
    assert.equal(isFallbackSkeletonAppContent(app.content), false);
    assert.equal(filled.appShellIncomplete, false);
    assert.deepEqual(filled.skeletonFilledPaths, []);
    assert.deepEqual(filled.recoveredPartialPaths, ["src/App.tsx"]);
  });

  it("marks app shell incomplete when critical skeleton is used", () => {
    const existing = buildGreenfieldFallbackSkeleton().filter(
      (f) => f.path !== "src/App.tsx",
    );
    const filled = fillMissingGreenfieldFiles(
      existing,
      ["src/App.tsx"],
      "Build FieldFlow",
      { allowCriticalSkeleton: true },
    );
    const app = filled.files.find((f) => f.path === "src/App.tsx");
    assert.ok(app);
    assert.equal(isFallbackSkeletonAppContent(app.content), true);
    assert.equal(filled.appShellIncomplete, true);
    assert.deepEqual(filled.skeletonFilledPaths, ["src/App.tsx"]);
  });

  it("buildCriticalAppScaffold is not treated as placeholder skeleton", () => {
    const scaffold = buildCriticalAppScaffold(
      "Create a React TypeScript Vite app called FieldFlow.\n\nPages:\n1. Dashboard\n2. Leads\n3. Jobs",
    );
    assert.match(scaffold, /FieldFlow/);
    assert.match(scaffold, /Dashboard/);
    assert.match(scaffold, /useState/);
    assert.equal(isFallbackSkeletonAppContent(scaffold), false);
  });
});
