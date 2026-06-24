import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  appendFollowUpSnapshot,
  loadFollowUpSnapshots,
  snapshotLabelFromPrompt,
} from "./followUpSnapshots.ts";

describe("followUpSnapshots", () => {
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
  });

  afterEach(() => {
    globalThis.localStorage = original;
  });

  it("appends snapshot with truncated label", () => {
    const path = "/tmp/test-project-snapshots";
    const long = "A".repeat(60);
    appendFollowUpSnapshot(path, {
      prompt: long,
      files: [{ relPath: "src/App.tsx", absPath: "/tmp/App.tsx", content: "x" }],
    });
    const snaps = loadFollowUpSnapshots(path);
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0]?.index, 1);
    assert.equal(snapshotLabelFromPrompt(long).endsWith("…"), true);
  });
});
