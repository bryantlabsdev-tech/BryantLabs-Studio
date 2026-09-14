import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGreenfieldGenerationId,
  isGreenfieldNewRunStart,
  isUserCancelledGreenfieldFailure,
  shouldIgnoreGreenfieldRunMutation,
} from "@/core/greenfield/generationGuard";
import { applyGreenfieldRunUpdate, emptyGreenfieldRun } from "@/core/greenfield/runState";
import { cancelGreenfieldRunPatch } from "@/core/agent/greenfieldRunLifecycle";

describe("greenfield generation cancellation guards", () => {
  it("creates opaque generation ids", () => {
    const a = createGreenfieldGenerationId();
    const b = createGreenfieldGenerationId();
    assert.match(a, /^gf-/);
    assert.notEqual(a, b);
  });

  it("detects a new run start by generation id", () => {
    const prev = {
      ...emptyGreenfieldRun(),
      generationId: "gf-old",
      runResult: "cancelled" as const,
      genStatus: "cancelled",
    };
    assert.equal(
      isGreenfieldNewRunStart(prev, { generationId: "gf-new", genStatus: "running" }),
      true,
    );
  });

  it("ignores late success and failure on a cancelled generation", () => {
    const running = {
      ...emptyGreenfieldRun(),
      generationId: "gf-1",
      genStatus: "running" as const,
      runResult: "running" as const,
      runStartedAt: Date.now(),
    };
    const cancelled = {
      ...running,
      ...cancelGreenfieldRunPatch(running),
    };
    assert.equal(
      shouldIgnoreGreenfieldRunMutation(cancelled, {
        generationId: "gf-1",
        runResult: "success",
        genStatus: "done",
      }),
      true,
    );
    assert.equal(
      shouldIgnoreGreenfieldRunMutation(cancelled, {
        generationId: "gf-1",
        runResult: "failed",
      }),
      true,
    );
    const next = applyGreenfieldRunUpdate(cancelled, {
      generationId: "gf-1",
      runResult: "success",
      filesWritten: ["src/App.tsx"],
    });
    assert.equal(next, cancelled);
    assert.equal(next.runResult, "cancelled");
  });

  it("ignores a late response from an older generation after a new run starts", () => {
    const running = {
      ...emptyGreenfieldRun(),
      generationId: "gf-2",
      genStatus: "running",
      runResult: "running" as const,
    };
    const ignored = applyGreenfieldRunUpdate(running, {
      generationId: "gf-1",
      runResult: "success",
      genStatus: "done",
      filesWritten: ["package.json"],
    });
    assert.equal(ignored, running);
    assert.equal(ignored.generationId, "gf-2");
  });

  it("allows a new generation immediately after cancel", () => {
    const cancelled = {
      ...emptyGreenfieldRun(),
      generationId: "gf-1",
      runResult: "cancelled" as const,
      genStatus: "cancelled",
    };
    const composerStart = applyGreenfieldRunUpdate(cancelled, {
      actionType: "greenfield",
      runResult: "running",
      runStartedAt: Date.now(),
    });
    assert.equal(composerStart.runResult, "cancelled");

    const next = applyGreenfieldRunUpdate(cancelled, {
      generationId: "gf-2",
      genStatus: "running",
      runResult: "running",
    });
    assert.equal(next.generationId, "gf-2");
    assert.equal(next.runResult, "running");
    assert.equal(next.genStatus, "running");
  });

  it("treats cancel patches as idempotent", () => {
    const running = {
      ...emptyGreenfieldRun(),
      generationId: "gf-1",
      genStatus: "running" as const,
      runResult: "running" as const,
    };
    const once = applyGreenfieldRunUpdate(running, cancelGreenfieldRunPatch(running));
    const twice = applyGreenfieldRunUpdate(once, cancelGreenfieldRunPatch(once));
    assert.equal(once.runResult, "cancelled");
    assert.equal(twice.runResult, "cancelled");
  });

  it("classifies cancelled provider failures", () => {
    assert.equal(
      isUserCancelledGreenfieldFailure({
        ok: false,
        exactFailureStage: "cancelled",
        error: "Provider request cancelled by user.",
      }),
      true,
    );
    assert.equal(
      isUserCancelledGreenfieldFailure({ ok: true, error: "Provider request cancelled by user." }),
      false,
    );
  });
});
