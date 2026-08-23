import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  readUseAgentLoopForEdits,
  writeUseAgentLoopForEdits,
} from "@/core/build/followUpAgentLoop";

describe("followUpAgentLoop", () => {
  const original = globalThis.localStorage;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original,
    });
  });

  it("defaults to structured build_loop (agent loop off)", () => {
    assert.equal(readUseAgentLoopForEdits(), false);
  });

  it("persists explicit agent loop preference", () => {
    writeUseAgentLoopForEdits(true);
    assert.equal(readUseAgentLoopForEdits(), true);
    writeUseAgentLoopForEdits(false);
    assert.equal(readUseAgentLoopForEdits(), false);
  });
});
