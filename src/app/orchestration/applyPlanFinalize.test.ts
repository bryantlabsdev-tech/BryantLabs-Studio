import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { finalizeOrchestrationAfterApplyPlan } from "@/app/orchestration/applyPlanFinalize";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import { createAgentLoopSession } from "@/core/agentLoop/state";

describe("finalizeOrchestrationAfterApplyPlan", () => {
  it("stops agent and execution when apply plan fully succeeded", () => {
    const applyPlanSuccessRef = { current: null as unknown };
    const executionNoChangeGuardRef = { current: new Map([["x", 1]]) };
    const agentControlRef = { current: { paused: false, stopped: false } };
    const agentUpdates: unknown[] = [];
    const executionUpdates: unknown[] = [];
    const logs: string[] = [];
    let pushAgentCalled = false;

    const host = {
      applyPlanSuccessRef,
      executionNoChangeGuardRef,
      agentControlRef,
      setAgentLoopSession: (
        fn: import("react").SetStateAction<
          import("@/core/agentLoop").AgentLoopSession | null
        >,
      ) => {
        agentUpdates.push(
          typeof fn === "function"
            ? fn(createAgentLoopSession("premium ui"))
            : fn,
        );
      },
      setExecutionSession: (
        fn: import("react").SetStateAction<
          import("@/core/execution").ExecutionSession | null
        >,
      ) => {
        const base = {
          prompt: "x",
          planSummary: "s",
          planSource: "ai" as const,
          phase: "running" as const,
          currentStepId: null,
          pausedAtStepId: null,
          applyError: null,
          steps: [],
          files: [],
          diagnostics: {
            executionPlanLines: [],
            completedSteps: 0,
            totalSteps: 0,
            filesModified: [],
            validationSummary: null,
          },
          verification: null,
        };
        executionUpdates.push(
          typeof fn === "function" ? fn(base) : fn,
        );
      },
      pushAgent: () => {
        pushAgentCalled = true;
      },
      appendGreenfieldRunLog: (
        _stage: string,
        _status: string,
        message: string,
      ) => {
        logs.push(message);
      },
    } as unknown as ApplyPlanOrchestrationHost;

    finalizeOrchestrationAfterApplyPlan(
      host,
      {
        prompt: "premium ui",
        filesWritten: ["src/App.tsx"],
        typecheckPassed: true,
        buildPassed: true,
        previewOk: false,
      },
      null,
    );

    assert.ok(applyPlanSuccessRef.current);
    assert.equal(executionNoChangeGuardRef.current.size, 0);
    assert.equal(agentControlRef.current.stopped, true);
    assert.equal(agentUpdates.length, 1);
    assert.equal(executionUpdates.length, 1);
    assert.equal(pushAgentCalled, true);
    assert.match(logs[0] ?? "", /Apply Plan/i);
  });

  it("no-ops when verification gates are not met", () => {
    const applyPlanSuccessRef = { current: null };
    const host = {
      applyPlanSuccessRef,
      executionNoChangeGuardRef: { current: new Map() },
      agentControlRef: { current: { paused: false, stopped: false } },
      setAgentLoopSession: () => {
        throw new Error("should not run");
      },
      setExecutionSession: () => {
        throw new Error("should not run");
      },
      pushAgent: () => {
        throw new Error("should not run");
      },
      appendGreenfieldRunLog: () => {
        throw new Error("should not run");
      },
    } as unknown as ApplyPlanOrchestrationHost;

    finalizeOrchestrationAfterApplyPlan(
      host,
      {
        prompt: "x",
        filesWritten: ["a.ts"],
        typecheckPassed: false,
        buildPassed: true,
        previewOk: false,
      },
      null,
    );
    assert.equal(applyPlanSuccessRef.current, null);
  });
});
