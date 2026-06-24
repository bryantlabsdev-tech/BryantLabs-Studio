import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBootstrapFiles } from "@/core/greenfield/bootstrapTemplate";
import { planManifestFromPrompt } from "@/core/greenfield/manifestPlanner";

describe("bootstrapTemplate", () => {
  it("includes tailwind configs when manifest requests Tailwind", () => {
    const manifest = planManifestFromPrompt("FieldFlow Tailwind React Router");
    const files = buildBootstrapFiles(manifest);
    assert.ok(files.some((f) => f.path === "tailwind.config.js"));
    assert.ok(files.some((f) => f.path === "postcss.config.js"));
    assert.ok(files.find((f) => f.path === "package.json")?.content.includes("tailwindcss"));
  });

  it("scaffolds IconStub and omits lucide-react from package.json", () => {
    const manifest = planManifestFromPrompt("FleetOps lucide icons React Router");
    const files = buildBootstrapFiles(manifest);
    const pkg = files.find((f) => f.path === "package.json")?.content ?? "";
    assert.ok(files.some((f) => f.path === "src/components/IconStub.tsx"));
    assert.doesNotMatch(pkg, /lucide-react/);
  });
});
