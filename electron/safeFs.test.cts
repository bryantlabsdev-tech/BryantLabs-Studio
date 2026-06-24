import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import {
  ensureBryantlabsDir,
  enqueueSerializedWrite,
  safeMkdir,
  validateDirectoryPath,
  validateProjectRootForMetadata,
  writeBryantlabsJson,
  writeJsonAtomic,
} from "./safeFs.cjs";
import {
  captureProjectWriteToken,
  isActiveProjectRoot,
  isWriteTokenCurrent,
  noteActiveProject,
} from "./projectWriteCoordinator.cjs";
import { saveRunCheckpointForProject } from "./runCheckpoint.cjs";
import { saveSemanticIndex } from "./semanticIndex/store.cjs";

describe("safeFs", () => {
  it("mkdir with valid project root succeeds", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-safe-"));
    const result = await ensureBryantlabsDir(root);
    assert.equal(result.ok, true);
    const stat = await fs.stat(path.join(root, ".bryantlabs"));
    assert.ok(stat.isDirectory());
  });

  it("mkdir with invalid path returns structured error", async () => {
    const empty = await safeMkdir("");
    assert.equal(empty.ok, false);
    assert.match(empty.reason ?? "", /Invalid path/i);

    const nil = await safeMkdir(null);
    assert.equal(nil.ok, false);
  });

  it(".bryantlabs directory creation is idempotent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-safe-"));
    const first = await ensureBryantlabsDir(root);
    const second = await ensureBryantlabsDir(root);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  });

  it("validateDirectoryPath rejects empty and relative roots", () => {
    assert.equal(validateDirectoryPath("").ok, false);
    assert.equal(validateDirectoryPath("   ").ok, false);
    assert.equal(validateProjectRootForMetadata(undefined).ok, false);
  });

  it("writeJsonAtomic writes readable JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-safe-"));
    const file = path.join(root, "sample.json");
    const result = await writeJsonAtomic(file, { hello: "world" }, "filesystem");
    assert.equal(result.ok, true);
    const raw = await fs.readFile(file, "utf8");
    assert.deepEqual(JSON.parse(raw), { hello: "world" });
  });

  it("semantic index write failure returns structured error for invalid root", async () => {
    const result = await saveSemanticIndex("", [], {
      vocabulary: [],
      idf: new Float32Array(),
      vectors: new Float32Array(),
      chunkCount: 0,
      dim: 0,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Invalid/i);
  });

  it("concurrent checkpoint saves do not throw", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-safe-"));
    noteActiveProject(root);
    const checkpoint = { projectPath: root, version: 1, kind: "test" };
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        saveRunCheckpointForProject(root, { ...checkpoint, seq: i }),
      ),
    );
    assert.ok(results.every((r) => r.ok === true || typeof r.reason === "string"));
    const saved = await fs.readFile(
      path.join(root, ".bryantlabs", "run-checkpoint.v1.json"),
      "utf8",
    );
    assert.ok(saved.length > 0);
  });

  it("checkpoint save after project change is ignored safely", async () => {
    const rootA = await mkdtemp(path.join(tmpdir(), "bl-safe-a-"));
    const rootB = await mkdtemp(path.join(tmpdir(), "bl-safe-b-"));
    noteActiveProject(rootA);
    noteActiveProject(rootB);
    const result = await saveRunCheckpointForProject(rootB, {
      projectPath: rootA,
      version: 1,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /does not match/i);
  });

  it("project write token invalidates after project switch", async () => {
    const rootA = await mkdtemp(path.join(tmpdir(), "bl-safe-a-"));
    const rootB = await mkdtemp(path.join(tmpdir(), "bl-safe-b-"));
    noteActiveProject(rootA);
    const token = captureProjectWriteToken(rootA);
    assert.ok(token >= 0);
    noteActiveProject(rootB);
    assert.equal(isWriteTokenCurrent(rootA, token), false);
    assert.equal(isActiveProjectRoot(rootB), true);
  });

  it("serialized writes run in order without throwing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-safe-"));
    noteActiveProject(root);
    const order: number[] = [];
    await Promise.all([
      enqueueSerializedWrite("test-key", async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true };
      }),
      enqueueSerializedWrite("test-key", async () => {
        order.push(2);
        return { ok: true };
      }),
    ]);
    assert.deepEqual(order, [1, 2]);
    const meta = await writeBryantlabsJson(
      root,
      "semantic-index/v1.json",
      { version: 1, projectPath: root },
      "semantic_index",
    );
    assert.equal(meta.ok, true);
  });
});
