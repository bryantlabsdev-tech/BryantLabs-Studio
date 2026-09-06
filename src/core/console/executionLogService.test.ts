import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executionLogService,
  executionLogStatesEqual,
} from "@/core/console/executionLogService";

describe("executionLogService snapshot identity", () => {
  it("returns the same state object when nothing changed", () => {
    const first = executionLogService.getState();
    const second = executionLogService.getState();
    assert.equal(second, first);
    assert.equal(executionLogStatesEqual(first, second), true);
  });

  it("does not notify subscribers when project path is unchanged", () => {
    const received: number[] = [];
    const unsub = executionLogService.subscribe(() => {
      received.push(Date.now());
    });
    try {
      const afterSubscribe = received.length;
      executionLogService.setProjectPath(executionLogService.getState().projectPath);
      executionLogService.setEnabled(executionLogService.getState().enabled);
      assert.equal(received.length, afterSubscribe);
    } finally {
      unsub();
    }
  });

  it("idle start ticks do not emit a new snapshot identity", () => {
    executionLogService.start();
    try {
      const before = executionLogService.getState();
      assert.notEqual(before.metadata.status, "running");
      const after = executionLogService.getState();
      assert.equal(after, before);
    } finally {
      executionLogService.stop();
    }
  });
});
