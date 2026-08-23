import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATION_DEADLINE_MS,
  failRunOnDeadlinePatch,
  resolveExpiredOperationDeadline,
  runHasSuccessfulWritesOrActiveVerification,
  shouldAbortProviderOnDeadline,
} from "@/core/agent/operationDeadlines";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";

describe("operationDeadlines", () => {
  it("fails when the provider never starts streaming", () => {
    const startedAt = 1_700_000_000_000;
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      runResult: "running" as const,
      genStatus: "running" as const,
      runStartedAt: startedAt,
      entries: [
        {
          id: "gen",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date(startedAt).toISOString(),
        },
      ],
    };
    const expired = resolveExpiredOperationDeadline(
      run,
      startedAt + OPERATION_DEADLINE_MS.providerFirstByte,
    );
    assert.ok(expired);
    assert.equal(expired.stage, "provider_first_byte");
  });

  it("allows generation to continue after a provider response until the AI generation ceiling", () => {
    const startedAt = 1_700_000_000_000;
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      genStatus: "running" as const,
      runStartedAt: startedAt,
      entries: [
        {
          id: "gen",
          stage: "generation" as const,
          status: "running" as const,
          message: "Generation started",
          timestamp: new Date(startedAt).toISOString(),
        },
        {
          id: "resp",
          stage: "provider_response" as const,
          status: "success" as const,
          message: "Provider response received",
          timestamp: new Date(startedAt + 20_000).toISOString(),
        },
      ],
    };
    assert.equal(resolveExpiredOperationDeadline(run, startedAt + 90_000), null);
    const expired = resolveExpiredOperationDeadline(
      run,
      startedAt + OPERATION_DEADLINE_MS.aiGeneration,
    );
    assert.ok(expired);
    assert.equal(expired.stage, "generation");
  });

  it("does not treat prior successful apply_plan as a first-byte stall", () => {
    const startedAt = 1_700_000_000_000;
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      runStartedAt: startedAt - 120_000,
      entries: [
        {
          id: "apply",
          stage: "apply_plan" as const,
          status: "success" as const,
          message: "Wrote 2 file(s)",
          timestamp: new Date(startedAt - 90_000).toISOString(),
        },
        {
          id: "call",
          stage: "provider_call" as const,
          status: "running" as const,
          message: "[provider_call] started",
          timestamp: new Date(startedAt).toISOString(),
        },
      ],
    };
    assert.equal(
      resolveExpiredOperationDeadline(run, startedAt + 30_000),
      null,
    );
  });

  it("successful patch application wins over a stale watchdog failure", () => {
    const startedAt = 1_700_000_000_000;
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      runStartedAt: startedAt,
      entries: [
        {
          id: "call",
          stage: "provider_call" as const,
          status: "running" as const,
          message: "[provider_call] started",
          timestamp: new Date(startedAt).toISOString(),
        },
        {
          id: "write",
          stage: "write" as const,
          status: "success" as const,
          message: "Updated src/App.tsx",
          timestamp: new Date(startedAt + 50_000).toISOString(),
        },
        {
          id: "verify",
          stage: "verification" as const,
          status: "running" as const,
          message: "Verification started",
          timestamp: new Date(startedAt + 55_000).toISOString(),
        },
      ],
    };
    assert.equal(runHasSuccessfulWritesOrActiveVerification(run), true);
    assert.equal(
      resolveExpiredOperationDeadline(run, startedAt + OPERATION_DEADLINE_MS.providerFirstByte),
      null,
    );
    const expired = {
      stage: "provider_first_byte",
      deadlineMs: OPERATION_DEADLINE_MS.providerFirstByte,
      elapsedMs: OPERATION_DEADLINE_MS.providerFirstByte,
      reason: "Provider did not begin responding within 60s.",
    };
    assert.equal(failRunOnDeadlinePatch(run, expired), null);
  });

  it("does not first-byte-fail an in-flight provider_call (HTTP owns TTFB)", () => {
    const startedAt = 1_700_000_000_000;
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      entries: [
        {
          id: "call",
          stage: "provider_call" as const,
          status: "running" as const,
          message: "[provider_call] started",
          timestamp: new Date(startedAt).toISOString(),
        },
      ],
    };
    assert.equal(
      resolveExpiredOperationDeadline(
        run,
        startedAt + OPERATION_DEADLINE_MS.providerFirstByte,
      ),
      null,
    );
  });

  it("does not first-byte-fail apply_plan edits after relaunch", () => {
    const startedAt = 1_700_000_000_000;
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "apply_plan" as const,
      runResult: "running" as const,
      genStatus: "idle",
      entries: [
        {
          id: "apply",
          stage: "apply_plan" as const,
          status: "running" as const,
          message: "Apply Plan — proposing patches",
          timestamp: new Date(startedAt).toISOString(),
        },
      ],
    };
    assert.equal(
      resolveExpiredOperationDeadline(
        run,
        startedAt + OPERATION_DEADLINE_MS.providerFirstByte,
      ),
      null,
    );
  });

  it("apply_plan proposing uses multi-phase orchestration ceiling not 30s write deadline", () => {
    const startedAt = 1_700_000_000_000;
    const run = {
      ...emptyGreenfieldRun(),
      runResult: "running" as const,
      entries: [
        {
          id: "apply",
          stage: "apply_plan" as const,
          status: "running" as const,
          message: "Apply Plan — proposing patches",
          timestamp: new Date(startedAt).toISOString(),
        },
      ],
    };
    assert.equal(
      resolveExpiredOperationDeadline(run, startedAt + 45_000),
      null,
    );
    assert.equal(
      resolveExpiredOperationDeadline(run, startedAt + OPERATION_DEADLINE_MS.aiGeneration),
      null,
    );
    const expired = resolveExpiredOperationDeadline(
      run,
      startedAt + OPERATION_DEADLINE_MS.multiPhaseOrchestration,
    );
    assert.ok(expired);
    assert.equal(expired.stage, "apply_plan");
  });

  it("keeps AI generation and orchestration ceilings under 15 minutes", () => {
    assert.ok(OPERATION_DEADLINE_MS.aiGeneration <= 195_000);
    assert.ok(OPERATION_DEADLINE_MS.multiPhaseOrchestration < 15 * 60_000);
    assert.ok(OPERATION_DEADLINE_MS.aiGeneration < 15 * 60_000);
  });

  it("never aborts provider HTTP from deadline notifications alone", () => {
    assert.equal(shouldAbortProviderOnDeadline(), false);
  });
});
