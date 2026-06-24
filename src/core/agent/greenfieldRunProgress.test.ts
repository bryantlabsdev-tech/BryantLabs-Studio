import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveGreenfieldRunProgress,
  formatGreenfieldElapsed,
  GREENFIELD_STUCK_THRESHOLDS,
} from "@/core/agent/greenfieldRunProgress";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

describe("deriveGreenfieldRunProgress", () => {
  it("shows live progress when greenfield panel is active", () => {
    const now = Date.now();
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      genStatus: "running" as const,
      runResult: "running" as const,
      provider: "gemini",
      model: "gemini-2.0-flash",
      runStartedAt: now - 134_000,
      entries: [
        {
          id: "gen",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date(now - 5_000).toISOString(),
        },
      ],
    };

    const progress = deriveGreenfieldRunProgress(run, true, now);
    assert.ok(progress);
    assert.equal(progress.isActive, true);
    assert.equal(progress.currentStageLabel, "Generating files");
    assert.equal(progress.provider, "Gemini");
    assert.equal(progress.model, "gemini-2.0-flash");
    assert.equal(progress.steps.length, 10);
    assert.match(progress.composerLabel, /Creating app/);
    assert.match(progress.composerLabel, /02:14 elapsed/);
    assert.ok(progress.activity.length > 0);
  });

  it("shows Review stage after files ready — not Generating", () => {
    const now = Date.now();
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      genStatus: "done" as const,
      writeStatus: "idle" as const,
      setupStatus: "idle" as const,
      runResult: "running" as const,
      provider: "gemini",
      model: "gemini-2.0-flash",
      generatedFiles: GREENFIELD_FILE_PATHS.map((path) => ({
        path,
        content: "export {}",
      })),
      runStartedAt: now - 60_000,
      latestAction: {
        status: "success" as const,
        summary: "Files ready for review",
        stage: "review" as const,
        at: new Date(now - 5_000).toISOString(),
      },
      entries: [
        {
          id: "gen-running",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date(now - 55_000).toISOString(),
        },
        {
          id: "provider",
          stage: "provider_response" as const,
          status: "success" as const,
          message: "Provider response received",
          timestamp: new Date(now - 50_000).toISOString(),
        },
        {
          id: "parser",
          stage: "parser" as const,
          status: "success" as const,
          message: "All seven files parsed",
          timestamp: new Date(now - 45_000).toISOString(),
        },
        {
          id: "review",
          stage: "review" as const,
          status: "success" as const,
          message: "Files ready for review",
          timestamp: new Date(now - 5_000).toISOString(),
        },
      ],
    };

    const progress = deriveGreenfieldRunProgress(run, true, now);
    assert.ok(progress);
    assert.equal(progress.currentStage, "review");
    assert.equal(progress.currentStageLabel, "Review / Auto-write");
    assert.notEqual(progress.currentStageLabel, "Generating files");
    assert.equal(progress.steps.find((s) => s.id === "generating")?.status, "done");
    assert.equal(progress.steps.find((s) => s.id === "review")?.status, "running");
  });

  it("updates stuck messaging at 60/120/180 second thresholds", () => {
    const runStartedAt = 1_000_000;
    const base = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      genStatus: "running" as const,
      runResult: "running" as const,
      provider: "ollama" as const,
      model: "llama3",
      runStartedAt: runStartedAt,
      entries: [
        {
          id: "gen",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date(runStartedAt).toISOString(),
        },
      ],
    };

    const at60 = deriveGreenfieldRunProgress(
      base,
      true,
      runStartedAt + GREENFIELD_STUCK_THRESHOLDS.WAITING_60_MS,
    );
    assert.equal(at60?.stuckLevel, "waiting_60");
    assert.match(at60?.stuckMessage ?? "", /Still waiting for provider/);

    const at120 = deriveGreenfieldRunProgress(
      base,
      true,
      runStartedAt + GREENFIELD_STUCK_THRESHOLDS.WAITING_120_MS,
    );
    assert.equal(at120?.stuckLevel, "waiting_120");
    assert.match(at120?.stuckMessage ?? "", /longer than expected/);

    const at180 = deriveGreenfieldRunProgress(
      base,
      true,
      runStartedAt + GREENFIELD_STUCK_THRESHOLDS.WAITING_180_MS,
    );
    assert.equal(at180?.stuckLevel, "waiting_180");
    assert.match(at180?.stuckMessage ?? "", /cancel, retry, or switch provider/);

    const at5m = deriveGreenfieldRunProgress(
      base,
      true,
      runStartedAt + GREENFIELD_STUCK_THRESHOLDS.POSSIBLY_STUCK_MS,
    );
    assert.equal(at5m?.stuckLevel, "possibly_stuck_5m");
    assert.match(at5m?.stuckMessage ?? "", /exceeded 5 minutes/);
  });
});

describe("formatGreenfieldElapsed", () => {
  it("formats mm:ss", () => {
    assert.equal(formatGreenfieldElapsed(134_000), "02:14");
    assert.equal(formatGreenfieldElapsed(0), "00:00");
  });
});
