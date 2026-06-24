import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  appendPendingAgentMessage,
  clearPendingAgentChat,
  createAgentUserMessage,
  loadPendingAgentChat,
  mergePendingIntoProjectChat,
} from "@/core/agent/agentChat";

describe("agentChat", () => {
  const original = globalThis.localStorage;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    globalThis.localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    } as Storage;
    clearPendingAgentChat();
  });

  afterEach(() => {
    globalThis.localStorage = original;
    clearPendingAgentChat();
  });

  it("stores pending messages before a project is open", () => {
    const msg = createAgentUserMessage("Build a Sudoku app");
    appendPendingAgentMessage(msg);
    assert.equal(loadPendingAgentChat().length, 1);
    assert.equal(loadPendingAgentChat()[0]?.text, "Build a Sudoku app");
  });

  it("merges pending chat into project chat on open", () => {
    appendPendingAgentMessage(createAgentUserMessage("Build a Sudoku app"));
    const merged = mergePendingIntoProjectChat("/tmp/sudoku");
    assert.equal(merged.length, 1);
    assert.equal(loadPendingAgentChat().length, 0);
  });
});
