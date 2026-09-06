import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyAgentWorkspaceSession,
  patchAgentContext,
  startAgentSession,
  syncAgentSessionFromPipeline,
} from "@/core/agentWorkspace/store";

describe("patchAgentContext", () => {
  it("returns the same session when the patch is already applied", () => {
    const session = startAgentSession(null, "Ship the app");
    const once = patchAgentContext(session, { model: "anthropic · claude-opus-4-6" });
    const twice = patchAgentContext(once, { model: "anthropic · claude-opus-4-6" });
    assert.equal(twice, once);
  });
});

describe("syncAgentSessionFromPipeline", () => {
  it("leaves idle sessions untouched", () => {
    const idle = emptyAgentWorkspaceSession();
    const next = syncAgentSessionFromPipeline(idle, {
      goal: "Build it",
      phase: "Phase 1: Plan",
      task: null,
      file: null,
      model: "anthropic · claude-opus-4-6",
      tokens: null,
    });
    assert.equal(next, idle);
  });

  it("returns the same active session when context is already current", () => {
    let session = startAgentSession(null, "Ship the app");
    session = patchAgentContext(session, {
      goal: "Ship the app",
      model: "anthropic · claude-opus-4-6",
    });
    const next = syncAgentSessionFromPipeline(session, {
      goal: "Ship the app",
      phase: null,
      task: null,
      file: null,
      model: "anthropic · claude-opus-4-6",
      tokens: null,
    });
    assert.equal(next, session);
  });
});
