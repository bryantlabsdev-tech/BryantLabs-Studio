import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createQuitTeardownCoordinator,
  shouldQuitWhenAllWindowsClosed,
} from "./quitTeardown.cjs";

function mockEvent(): { prevented: number; preventDefault(): void } {
  return {
    prevented: 0,
    preventDefault() {
      this.prevented += 1;
    },
  };
}

describe("quit teardown coordinator", () => {
  it("prevents the first quit, coalesces repeats, and resumes quit once", async () => {
    let stopCalls = 0;
    let resumeCalls = 0;
    let releaseStop!: () => void;
    const stopPreviewAsync = () => {
      stopCalls += 1;
      return new Promise<void>((resolve) => {
        releaseStop = resolve;
      });
    };
    let terminalsDestroyed = 0;
    const logs: string[] = [];
    const coordinator = createQuitTeardownCoordinator({
      stopPreviewAsync,
      destroyAllTerminals: () => {
        terminalsDestroyed += 1;
      },
      quit: () => {
        resumeCalls += 1;
      },
      log: (message) => logs.push(message),
      timeoutMs: 5_000,
    });

    const first = mockEvent();
    const second = mockEvent();
    const third = mockEvent();
    assert.equal(coordinator.intercept(first), true);
    assert.equal(coordinator.intercept(second), true);
    assert.equal(coordinator.intercept(third), true);
    assert.equal(first.prevented, 1);
    assert.equal(second.prevented, 1);
    assert.equal(third.prevented, 1);
    assert.equal(coordinator.isTeardownPending(), true);
    assert.equal(stopCalls, 1);
    assert.equal(resumeCalls, 0);
    assert.equal(terminalsDestroyed, 0);

    releaseStop();
    await coordinator.whenSettled();
    assert.equal(terminalsDestroyed, 1);
    assert.equal(resumeCalls, 1);
    assert.equal(coordinator.isQuitAllowed(), true);

    const finalEvent = mockEvent();
    assert.equal(coordinator.intercept(finalEvent), false);
    assert.equal(finalEvent.prevented, 0);
    assert.equal(resumeCalls, 1);
    assert.equal(stopCalls, 1);
    assert.equal(logs.length, 0);
  });

  it("still permits quit after timeout or cleanup error and still stops terminals", async () => {
    let resumeCalls = 0;
    let terminalsDestroyed = 0;
    const logs: string[] = [];
    const hanging = createQuitTeardownCoordinator({
      stopPreviewAsync: () => new Promise(() => {}),
      destroyAllTerminals: () => {
        terminalsDestroyed += 1;
      },
      quit: () => {
        resumeCalls += 1;
      },
      log: (message) => logs.push(message),
      timeoutMs: 40,
    });
    const hangEvent = mockEvent();
    hanging.intercept(hangEvent);
    assert.equal(hangEvent.prevented, 1);
    await hanging.whenSettled();
    assert.equal(resumeCalls, 1);
    assert.equal(terminalsDestroyed, 1);
    assert.equal(hanging.isQuitAllowed(), true);
    assert.ok(logs.some((line) => line.includes("timed out")));

    const failing = createQuitTeardownCoordinator({
      stopPreviewAsync: async () => {
        throw new Error("preview boom");
      },
      destroyAllTerminals: () => {
        terminalsDestroyed += 1;
        throw new Error("pty boom");
      },
      quit: () => {
        resumeCalls += 1;
      },
      log: (message) => logs.push(message),
      timeoutMs: 1_000,
    });
    failing.intercept(mockEvent());
    await failing.whenSettled();
    assert.equal(resumeCalls, 2);
    assert.equal(terminalsDestroyed, 2);
    assert.ok(logs.some((line) => line.includes("preview stop failed")));
    assert.ok(logs.some((line) => line.includes("terminal cleanup failed")));
  });

  it("does not quit merely because the last macOS window closed", () => {
    assert.equal(shouldQuitWhenAllWindowsClosed("darwin"), false);
    assert.equal(shouldQuitWhenAllWindowsClosed("linux"), true);
    assert.equal(shouldQuitWhenAllWindowsClosed("win32"), true);
  });
});
