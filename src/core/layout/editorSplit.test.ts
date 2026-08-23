import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDITOR_SPLIT_DEFAULTS,
  EDITOR_SPLIT_STORAGE_KEY,
  loadEditorSplitPrefs,
  saveEditorSplitPrefs,
} from "@/core/layout/editorSplit";

describe("editorSplit", () => {
  it("loads defaults when storage is empty", () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    try {
      assert.deepEqual(loadEditorSplitPrefs(), EDITOR_SPLIT_DEFAULTS);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });

  it("round-trips prefs and clamps ratio", () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    try {
      saveEditorSplitPrefs({
        enabled: true,
        secondaryPath: "/tmp/foo.ts",
        ratio: 0.62,
      });
      const loaded = loadEditorSplitPrefs();
      assert.equal(loaded.enabled, true);
      assert.equal(loaded.secondaryPath, "/tmp/foo.ts");
      assert.equal(loaded.ratio, 0.62);

      saveEditorSplitPrefs({
        enabled: false,
        secondaryPath: null,
        ratio: 0.05,
      });
      assert.equal(loadEditorSplitPrefs().ratio, EDITOR_SPLIT_DEFAULTS.ratio);
      assert.ok(store.has(EDITOR_SPLIT_STORAGE_KEY));
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
