import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readRecentProjects,
  recordRecentProject,
} from "@/core/project/recentProjects";

describe("recentProjects", () => {
  it("records and dedupes projects by path", () => {
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
      recordRecentProject("/tmp/foo", "Foo App");
      recordRecentProject("/tmp/bar", "Bar App");
      recordRecentProject("/tmp/foo/", "Foo App Updated");

      const recent = readRecentProjects();
      assert.equal(recent.length, 2);
      assert.equal(recent[0]?.path, "/tmp/foo");
      assert.equal(recent[0]?.name, "Foo App Updated");
      assert.equal(recent[1]?.path, "/tmp/bar");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
