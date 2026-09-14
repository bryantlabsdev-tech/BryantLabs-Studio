import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planManifestFromPrompt } from "@/core/greenfield/manifestPlanner";
import {
  buildAppIntegrationPrompt,
  buildPagesBatchPhasePrompt,
  buildPagesPhasePrompt,
  buildSharedPhasePrompt,
} from "@/core/greenfield/phasedPrompts";

describe("phasedPrompts allowlisted extras", () => {
  const manifest = planManifestFromPrompt(
    "Build FieldFlow with React Router and localStorage.\nPages:\n- Dashboard\n- Jobs",
  );

  it("does not forbid additional allowlisted src/ and public/ files", () => {
    const shared = buildSharedPhasePrompt("user", manifest, []);
    const pages = buildPagesPhasePrompt("user", manifest, []);
    const batch = buildPagesBatchPhasePrompt("user", manifest, manifest, [], 1, 1);
    const app = buildAppIntegrationPrompt("user", manifest, []);
    for (const prompt of [shared, pages, batch, app]) {
      assert.equal(prompt.includes("Do not reference files outside the requested list"), false);
      assert.match(prompt, /Required files MUST be present/);
      assert.match(prompt, /Additional allowlisted files under src\/ and public\/ ARE permitted/);
    }
    assert.equal(pages.includes("exactly"), false);
    assert.equal(batch.includes("exactly"), false);
  });
});
