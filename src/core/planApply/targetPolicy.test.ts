import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGameplayPatchTarget } from "@/core/planApply/targetPolicy";

describe("isGameplayPatchTarget", () => {
  it("allows App entry, styles, and stats files", () => {
    assert.equal(isGameplayPatchTarget("src/App.tsx"), true);
    assert.equal(isGameplayPatchTarget("src/index.css"), true);
    assert.equal(isGameplayPatchTarget("src/Stats.tsx"), true);
    assert.equal(isGameplayPatchTarget("src/StatsPanel.tsx"), true);
    assert.equal(isGameplayPatchTarget("src/components/GameBoard.tsx"), true);
  });

  it("does not treat StatusBar or Statement as stats gameplay targets", () => {
    assert.equal(isGameplayPatchTarget("src/components/StatusBar.tsx"), false);
    assert.equal(isGameplayPatchTarget("src/Statement.tsx"), false);
  });
});
