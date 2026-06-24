import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  validateWritePath,
  writeVerified,
  createProjectFile,
} from "./fileWriter.cjs";

describe("fileWriter safety", () => {
  it("blocks paths outside the project root", () => {
    const root = "/tmp/project";
    const result = validateWritePath(root, "/tmp/other/file.ts");
    assert.equal(result.ok, false);
  });

  it("blocks node_modules writes", () => {
    const root = "/tmp/project";
    const result = validateWritePath(
      root,
      path.join(root, "node_modules/pkg/index.js"),
    );
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /node_modules/);
  });

  it("blocks package-lock.json", () => {
    const root = "/tmp/project";
    const result = validateWritePath(
      root,
      path.join(root, "package-lock.json"),
    );
    assert.equal(result.ok, false);
  });

  it("writes and verifies a new file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-writer-"));
    const filePath = path.join(root, "src", "hello.ts");
    const result = await createProjectFile(root, filePath, "export const x = 1;\n");
    assert.equal(result.ok, true);
    const onDisk = await fs.readFile(filePath, "utf8");
    assert.equal(onDisk, "export const x = 1;\n");
  });

  it("rejects overwriting an existing file via createProjectFile", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-writer-"));
    const filePath = path.join(root, "exists.ts");
    await fs.writeFile(filePath, "old", "utf8");
    const result = await createProjectFile(root, filePath, "new");
    assert.equal(result.ok, false);
  });

  it("writeVerified round-trips content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-writer-"));
    const filePath = path.join(root, "note.txt");
    await fs.mkdir(root, { recursive: true });
    const result = await writeVerified(root, filePath, "hello");
    assert.equal(result.ok, true);
    assert.equal(await fs.readFile(filePath, "utf8"), "hello");
  });
});
