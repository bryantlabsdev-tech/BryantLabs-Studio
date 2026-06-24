import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gitDirtyCount,
  parseGitPorcelain,
  parseGitPorcelainLine,
} from "@/core/git/parseStatus";

describe("parseGitPorcelainLine", () => {
  it("parses modified unstaged", () => {
    const entry = parseGitPorcelainLine(" M src/app.tsx");
    assert.ok(entry);
    assert.equal(entry.path, "src/app.tsx");
    assert.equal(entry.unstaged, true);
    assert.equal(entry.staged, false);
  });

  it("parses staged and unstaged", () => {
    const entry = parseGitPorcelainLine("MM src/app.tsx");
    assert.ok(entry);
    assert.equal(entry.staged, true);
    assert.equal(entry.unstaged, true);
  });

  it("parses renames to the new path", () => {
    const entry = parseGitPorcelainLine("R  old.ts -> new.ts");
    assert.ok(entry);
    assert.equal(entry.path, "new.ts");
  });
});

describe("parseGitPorcelain", () => {
  it("parses mixed porcelain output", () => {
    const stdout = ["M  staged.ts", " M unstaged.ts", "?? new.ts"].join("\n");
    const files = parseGitPorcelain(stdout);
    assert.equal(files.length, 3);
    assert.equal(files[2]?.untracked, true);
    assert.equal(gitDirtyCount(files), 3);
  });
});
