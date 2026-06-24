import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REPLAY_FROZEN_PROJECT_IDS,
  formatRepairReplayReport,
} from "./repairReplay.ts";
import { STRESS_PROMPTS_FAST_IDS } from "./promptSelection.ts";
import {
  defaultLiveStressRoot,
  defaultReplayFrozenRoot,
} from "./stressPaths.ts";

describe("repairReplay", () => {
  it("aligns frozen replay ids with fast live suite", () => {
    assert.deepEqual(REPLAY_FROZEN_PROJECT_IDS, STRESS_PROMPTS_FAST_IDS);
    assert.equal(REPLAY_FROZEN_PROJECT_IDS.length, 5);
    assert.ok(REPLAY_FROZEN_PROJECT_IDS.includes("fleetops-pro"));
  });

  it("uses separate live and frozen corpus paths", () => {
    assert.match(defaultLiveStressRoot(), /\/live$/);
    assert.match(defaultReplayFrozenRoot(), /\/replay-frozen$/);
    assert.notEqual(defaultLiveStressRoot(), defaultReplayFrozenRoot());
  });

  it("formats replay report with corpus path", () => {
    const md = formatRepairReplayReport({
      corpusRoot: "/tmp/replay-frozen",
      results: [
        {
          id: "medtrack-clinic",
          root: "/tmp/replay-frozen/medtrack-clinic",
          typecheckOk: true,
          buildOk: true,
          deterministicPasses: 3,
          repairAttempts: 5,
          primaryError: null,
        },
      ],
      typecheckPassCount: 1,
      buildPassCount: 1,
      passTarget: 4,
      targetMet: false,
    });
    assert.match(md, /medtrack-clinic/);
    assert.match(md, /replay-frozen/);
    assert.match(md, /Target met/);
  });
});
