import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  defaultReplayFrozenRoot,
  legacyStressOutputRoot,
  repoStressFixturesRoot,
  resolveStressBaseRoot,
} from "./stressPaths";

describe("stressPaths", () => {
  it("repo fixtures root lives under benchmarks/fixtures/stress", () => {
    assert.match(repoStressFixturesRoot(), /benchmarks[/\\]fixtures[/\\]stress$/);
  });

  it("prefers repo fixtures when CI=1", () => {
    const prevCi = process.env.CI;
    const prevRoot = process.env.BRYANTLABS_STRESS_FIXTURES_ROOT;
    try {
      delete process.env.BRYANTLABS_STRESS_FIXTURES_ROOT;
      process.env.CI = "1";
      assert.equal(resolveStressBaseRoot(), repoStressFixturesRoot());
      assert.equal(defaultReplayFrozenRoot(), join(repoStressFixturesRoot(), "replay-frozen"));
      assert.equal(legacyStressOutputRoot(), join(repoStressFixturesRoot(), "legacy"));
    } finally {
      if (prevCi === undefined) delete process.env.CI;
      else process.env.CI = prevCi;
      if (prevRoot === undefined) delete process.env.BRYANTLABS_STRESS_FIXTURES_ROOT;
      else process.env.BRYANTLABS_STRESS_FIXTURES_ROOT = prevRoot;
    }
  });
});
