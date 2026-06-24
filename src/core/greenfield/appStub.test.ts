import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDeterministicAppFromManifest } from "@/core/greenfield/appStub";
import { planManifestFromPrompt } from "@/core/greenfield/manifestPlanner";
import { resolveGreenfieldPhaseMaxOutputTokens } from "@/core/greenfield/phaseTokens";

describe("resolveGreenfieldPhaseMaxOutputTokens", () => {
  it("uses 16384 for Gemini 2.5 Pro thinking models", () => {
    assert.equal(resolveGreenfieldPhaseMaxOutputTokens("gemini-2.5-pro"), 16384);
    assert.equal(resolveGreenfieldPhaseMaxOutputTokens("gemini-2.5-flash"), 8192);
  });
});

describe("appStub", () => {
  it("builds a router shell from manifest pages", () => {
    const manifest = planManifestFromPrompt(
      "FieldFlow React Router\nPages:\n1. Dashboard\n2. Leads",
    );
    const app = buildDeterministicAppFromManifest(manifest, [
      { path: "src/pages/Dashboard.tsx", content: "export default function Dashboard(){return <div/>}" },
      { path: "src/pages/Leads.tsx", content: "export default function Leads(){return <div/>}" },
    ]);
    assert.match(app.content, /Routes/);
    assert.match(app.content, /Route path="leads"/);
    assert.match(app.content, /Route index element={<Dashboard/);
    assert.match(app.content, /import \{ Layout \}/);
    assert.match(app.content, /import Leads from/);
    assert.doesNotMatch(app.content, /BrowserRouter/);
  });
});
