import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  clearDirectoryContents,
  findNextNumberedSiblingFolder,
} from "./folderPaths.cjs";
import { isEmptyDirectory } from "./write.cjs";

describe("folderPaths", () => {
  it("finds next numbered sibling folder", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-test-"));
    const base = path.join(root, "115");
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, "existing.txt"), "block", "utf8");

    const next = await findNextNumberedSiblingFolder(base);
    assert.equal(path.basename(next), "116");
    await fs.mkdir(next, { recursive: true });
    assert.equal(await isEmptyDirectory(next), true);
  });

  it("clears folder contents but requires explicit call", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-clear-"));
    await fs.writeFile(path.join(root, "a.txt"), "x", "utf8");
    const cleared = await clearDirectoryContents(root);
    assert.equal(cleared.ok, true);
    assert.equal(await isEmptyDirectory(root), true);
  });
});
