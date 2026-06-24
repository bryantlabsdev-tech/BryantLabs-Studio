import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRepositorySummary } from "@/core/repository/summary";
import { mockProjectScan } from "@/core/repository/testScan";

describe("buildRepositorySummary", () => {
  it("formats scan metadata for agents", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const text = buildRepositorySummary({
      ...scan,
      repositorySummary: "",
      summary: { ...scan.summary, bundler: "Vite" },
    });
    assert.match(text, /Project: test/);
    assert.match(text, /Bundler: Vite/);
    assert.match(text, /react/);
  });
});
