import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planManifestFromPrompt } from "@/core/greenfield/manifestPlanner";
import { buildStubPageFile, fillMissingPageStubs } from "@/core/greenfield/pageStubs";

describe("pageStubs", () => {
  it("builds a compilable stub page component", () => {
    const manifest = planManifestFromPrompt("FieldFlow Tailwind\nPages:\n1. Dashboard\n2. Leads");
    const page = manifest.pages.find((p) => p.title === "Leads")!;
    const stub = buildStubPageFile(page, manifest);
    assert.equal(stub.path, "src/pages/Leads.tsx");
    assert.match(stub.content, /export default function Leads/);
    assert.match(stub.content, /className=/);
  });

  it("fills only missing manifest page paths", () => {
    const manifest = planManifestFromPrompt(
      "Pages:\n1. Dashboard\n2. Leads\n3. Jobs",
    );
    const { files, stubbedPaths } = fillMissingPageStubs(manifest, [
      {
        path: "src/pages/Dashboard.tsx",
        content: "export default function Dashboard(){ return <div/>; }",
      },
    ]);
    assert.equal(stubbedPaths.length, 2);
    assert.ok(stubbedPaths.includes("src/pages/Leads.tsx"));
    assert.ok(stubbedPaths.includes("src/pages/Jobs.tsx"));
    assert.equal(files.filter((f) => f.path.startsWith("src/pages/")).length, 3);
  });
});
