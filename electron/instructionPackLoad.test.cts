import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import {
  loadTrustedInstructionSources,
  readContainedInstructionFile,
} from "./instructionPackLoad.cjs";
import { inspectContainedInstructionDirectory } from "./fileWriter.cjs";

async function makeProjectPair(): Promise<{
  project: string;
  outside: string;
  sentinel: string;
}> {
  const project = await mkdtemp(path.join(tmpdir(), "bl-instr-proj-"));
  const outside = await mkdtemp(path.join(tmpdir(), "bl-instr-out-"));
  const sentinel = path.join(outside, "SECRET.txt");
  await fs.writeFile(sentinel, "OUTSIDE_SECRET\n", "utf8");
  return { project, outside, sentinel };
}

describe("trusted instruction pack load", () => {
  it("loads fixed sources and always-apply mdc in lexical order without absolute paths", async () => {
    const { project } = await makeProjectPair();
    await fs.writeFile(path.join(project, "AGENTS.md"), "MARKER_AGENTS\n", "utf8");
    await fs.mkdir(path.join(project, ".bryantlabs"), { recursive: true });
    await fs.writeFile(path.join(project, ".bryantlabs", "rules.md"), "MARKER_STUDIO\n", "utf8");
    await fs.writeFile(path.join(project, ".cursorrules"), "MARKER_CURSOR\n", "utf8");
    await fs.mkdir(path.join(project, ".cursor", "rules"), { recursive: true });
    await fs.writeFile(
      path.join(project, ".cursor", "rules", "zzz.mdc"),
      "---\nalwaysApply: true\n---\nMARKER_Z\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(project, ".cursor", "rules", "aaa.mdc"),
      "---\nalwaysApply: true\n---\nMARKER_A\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(project, ".cursor", "rules", "skip.mdc"),
      "---\nalwaysApply: false\n---\nMARKER_SKIP\n",
      "utf8",
    );

    const loaded = loadTrustedInstructionSources(project);
    const rels = loaded.sources.map((s) => s.relativePath);
    assert.deepEqual(rels.slice(0, 3), ["AGENTS.md", ".bryantlabs/rules.md", ".cursorrules"]);
    assert.ok(rels.indexOf(".cursor/rules/aaa.mdc") < rels.indexOf(".cursor/rules/zzz.mdc"));
    const json = JSON.stringify(loaded);
    assert.equal(json.includes(project), false);
    assert.equal(json.includes("SECRET"), false);
  });

  it("rejects an outside symlink and a swapped file without leaking outside content", async () => {
    const { project, sentinel } = await makeProjectPair();
    const agents = path.join(project, "AGENTS.md");
    await fs.writeFile(agents, "INSIDE\n", "utf8");
    await fs.rm(agents);
    await fs.symlink(sentinel, agents);

    const loaded = loadTrustedInstructionSources(project);
    const json = JSON.stringify(loaded);
    assert.equal(json.includes("OUTSIDE_SECRET"), false);
    assert.ok(loaded.skipped.some((s) => s.path === "AGENTS.md" && s.reason === "symlink_escape"));

    const swapped = readContainedInstructionFile(project, "AGENTS.md", { remainingBytes: 65_536 });
    assert.equal(swapped.ok, false);
    if (!swapped.ok) assert.equal(swapped.reason, "symlink_escape");
  });

  it("keeps the higher-priority source when .cursorrules aliases AGENTS.md", async () => {
    const { project } = await makeProjectPair();
    await fs.writeFile(path.join(project, "AGENTS.md"), "ONCE\n", "utf8");
    await fs.symlink(path.join(project, "AGENTS.md"), path.join(project, ".cursorrules"));
    const loaded = loadTrustedInstructionSources(project);
    assert.equal(loaded.sources.filter((s) => s.body.includes("ONCE")).length, 1);
    assert.equal(loaded.sources[0]?.relativePath, "AGENTS.md");
    assert.ok(loaded.skipped.some((s) => s.path === ".cursorrules" && s.reason === "duplicate"));
  });

  it("rejects oversized files without reading them as instruction sources", async () => {
    const { project } = await makeProjectPair();
    const huge = Buffer.alloc(40_000, 0x41);
    await fs.writeFile(path.join(project, "AGENTS.md"), huge);
    const loaded = loadTrustedInstructionSources(project);
    assert.equal(loaded.sources.length, 0);
    assert.ok(loaded.skipped.some((s) => s.reason === "over_file_budget"));
    assert.equal(JSON.stringify(loaded).includes("A".repeat(1000)), false);
  });

  it("decodes invalid UTF-8 with replacement characters", async () => {
    const { project } = await makeProjectPair();
    await fs.writeFile(path.join(project, "AGENTS.md"), Buffer.from([0x80, 0x41, 0x0a]));
    const loaded = loadTrustedInstructionSources(project);
    assert.equal(loaded.sources.length, 1);
    assert.ok(loaded.sources[0]?.body.includes("\uFFFD"));
    assert.ok(loaded.sources[0]?.body.includes("A"));
  });

  it("bounds .mdc candidate enumeration", async () => {
    const { project } = await makeProjectPair();
    const dir = path.join(project, ".cursor", "rules");
    await fs.mkdir(dir, { recursive: true });
    for (let i = 0; i < 40; i += 1) {
      const name = `${String(i).padStart(3, "0")}.mdc`;
      await fs.writeFile(
        path.join(dir, name),
        "---\nalwaysApply: true\n---\nX\n",
        "utf8",
      );
    }
    const loaded = loadTrustedInstructionSources(project);
    const mdc = loaded.sources.filter((s) => s.relativePath.startsWith(".cursor/rules/"));
    assert.ok(mdc.length <= 32);
    assert.ok(loaded.skipped.some((s) => s.reason === "candidate_limit"));
  });

  it("rejects a FIFO instruction file", async () => {
    const { project } = await makeProjectPair();
    const fifo = path.join(project, "AGENTS.md");
    try {
      await new Promise<void>((resolve, reject) => {
        execFile("mkfifo", [fifo], (err) => (err ? reject(err) : resolve()));
      });
    } catch {
      return;
    }
    const loaded = loadTrustedInstructionSources(project);
    assert.ok(loaded.skipped.some((s) => s.reason === "not_regular_file"));
    assert.equal(loaded.sources.length, 0);
  });

  it("rejects a rules directory that escapes the project", async () => {
    const { project, outside } = await makeProjectPair();
    await fs.mkdir(path.join(project, ".cursor"));
    await fs.symlink(outside, path.join(project, ".cursor", "rules"));
    const inspected = inspectContainedInstructionDirectory(
      project,
      path.join(project, ".cursor", "rules"),
    );
    assert.equal(inspected.ok, false);
    const loaded = loadTrustedInstructionSources(project);
    assert.ok(loaded.skipped.some((s) => s.path === ".cursor/rules" && s.reason === "symlink_escape"));
    assert.equal(loaded.sources.some((s) => s.relativePath.includes(".cursor/rules")), false);
  });

  it("refuses NUL bytes as binary", async () => {
    const { project } = await makeProjectPair();
    await fs.writeFile(path.join(project, "AGENTS.md"), Buffer.from("ok\0secret"));
    const loaded = loadTrustedInstructionSources(project);
    assert.ok(loaded.skipped.some((s) => s.reason === "unreadable"));
    assert.equal(JSON.stringify(loaded).includes("secret"), false);
  });
});
