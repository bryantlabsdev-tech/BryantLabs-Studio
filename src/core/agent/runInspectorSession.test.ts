import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_RUN_INSPECTOR_SESSION,
  isInspectorRunListed,
  reduceRunInspectorSession,
  resolveInspectorLockedRunId,
} from "@/core/agent/runInspectorSession";

describe("runInspectorSession", () => {
  it("opens modal and locks run id", () => {
    const next = reduceRunInspectorSession(EMPTY_RUN_INSPECTOR_SESSION, {
      type: "open_modal",
      runId: "run-live-1",
    });
    assert.equal(next.modalOpen, true);
    assert.equal(next.lockedRunId, "run-live-1");
  });

  it("keeps modal content locked across live updates without changing run id", () => {
    let session = reduceRunInspectorSession(EMPTY_RUN_INSPECTOR_SESSION, {
      type: "open_modal",
      runId: "run-live-1",
    });
    session = reduceRunInspectorSession(session, { type: "set_tab", tab: "events" });
    session = reduceRunInspectorSession(session, { type: "set_tab", tab: "metrics" });

    assert.equal(session.lockedRunId, "run-live-1");
    assert.equal(session.tab, "metrics");
    assert.equal(session.modalOpen, true);
  });

  it("only clears locked run on close when center inspector is inactive", () => {
    let session = reduceRunInspectorSession(EMPTY_RUN_INSPECTOR_SESSION, {
      type: "open_modal",
      runId: "run-live-1",
    });
    session = reduceRunInspectorSession(session, {
      type: "center_inspector_active",
      runId: "run-live-1",
    });
    session = reduceRunInspectorSession(session, { type: "close_modal" });

    assert.equal(session.modalOpen, false);
    assert.equal(session.lockedRunId, "run-live-1");
    assert.equal(session.centerInspectorActive, true);
  });

  it("closes modal only via explicit close action", () => {
    const opened = reduceRunInspectorSession(EMPTY_RUN_INSPECTOR_SESSION, {
      type: "open_modal",
      runId: "run-live-1",
    });
    const closed = reduceRunInspectorSession(opened, { type: "close_modal" });
    assert.equal(closed.modalOpen, false);
  });

  it("resolves locked run id ahead of transient fallback ids", () => {
    const session = reduceRunInspectorSession(EMPTY_RUN_INSPECTOR_SESSION, {
      type: "lock_run",
      runId: "run-locked",
    });
    assert.equal(resolveInspectorLockedRunId(session, "run-fallback"), "run-locked");
  });

  it("reports unavailable runs that are not active or in history", () => {
    assert.equal(
      isInspectorRunListed("run-missing", {
        activeAgentRunId: "run-live-1",
        historyRunIds: ["run-old"],
      }),
      false,
    );
    assert.equal(
      isInspectorRunListed("run-live-1", {
        activeAgentRunId: "run-live-1",
        historyRunIds: [],
      }),
      true,
    );
  });
});
