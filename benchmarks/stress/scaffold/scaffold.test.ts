import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { STRESS_PROMPTS } from "../prompts";
import {
  generateAllStressScaffoldProjects,
  hashScaffoldFiles,
  projectBytesFingerprint,
} from "./generate";
import {
  committedLegacyCorpusRoot,
  committedReplayFrozenCorpusRoot,
  canonicalizeOutputPath,
  repoRoot,
  resolveScaffoldOutputPath,
  ScaffoldOutputError,
} from "./outputGuard";
import { pagesForPrompt } from "./parsePromptPages";
import { writeDeterministicStressScaffolds } from "./write";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function sourceOf(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

function pathIsInsideCorpusContents(input: unknown): boolean {
  const text = typeof input === "string" ? input : String(input);
  const abs = resolve(text);
  for (const root of [committedLegacyCorpusRoot(), committedReplayFrozenCorpusRoot()]) {
    const rel = relative(root, abs);
    if (rel && rel !== "" && !rel.startsWith("..") && !rel.startsWith("/")) {
      return true;
    }
  }
  return false;
}

async function withCorpusContentReadTrap<T>(fn: () => T | Promise<T>): Promise<T> {
  const fs = require("node:fs") as typeof import("node:fs");
  const promises = fs.promises;
  const originals = {
    readFileSync: fs.readFileSync,
    readFile: fs.readFile,
    openSync: fs.openSync,
    open: fs.open,
    createReadStream: fs.createReadStream,
    copyFileSync: fs.copyFileSync,
    promisesReadFile: promises.readFile,
    promisesOpen: promises.open,
  };
  const trap = (path: unknown) => {
    if (pathIsInsideCorpusContents(path)) {
      throw new Error(`trapped corpus read: ${String(path)}`);
    }
  };
  fs.readFileSync = ((path: Parameters<typeof fs.readFileSync>[0], ...rest: unknown[]) => {
    trap(path);
    return (originals.readFileSync as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof fs.readFileSync;
  fs.readFile = ((path: Parameters<typeof fs.readFile>[0], ...rest: unknown[]) => {
    trap(path);
    return (originals.readFile as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof fs.readFile;
  fs.openSync = ((path: Parameters<typeof fs.openSync>[0], ...rest: unknown[]) => {
    trap(path);
    return (originals.openSync as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof fs.openSync;
  fs.open = ((path: Parameters<typeof fs.open>[0], ...rest: unknown[]) => {
    trap(path);
    return (originals.open as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof fs.open;
  fs.createReadStream = ((path: Parameters<typeof fs.createReadStream>[0], ...rest: unknown[]) => {
    trap(path);
    return (originals.createReadStream as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof fs.createReadStream;
  fs.copyFileSync = ((src: Parameters<typeof fs.copyFileSync>[0], ...rest: unknown[]) => {
    trap(src);
    return (originals.copyFileSync as (...args: unknown[]) => unknown)(src, ...rest);
  }) as typeof fs.copyFileSync;
  promises.readFile = ((path: Parameters<typeof promises.readFile>[0], ...rest: unknown[]) => {
    trap(path);
    return (originals.promisesReadFile as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof promises.readFile;
  promises.open = ((path: Parameters<typeof promises.open>[0], ...rest: unknown[]) => {
    trap(path);
    return (originals.promisesOpen as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof promises.open;
  try {
    return await fn();
  } finally {
    fs.readFileSync = originals.readFileSync;
    fs.readFile = originals.readFile;
    fs.openSync = originals.openSync;
    fs.open = originals.open;
    fs.createReadStream = originals.createReadStream;
    fs.copyFileSync = originals.copyFileSync;
    promises.readFile = originals.promisesReadFile;
    promises.open = originals.promisesOpen;
  }
}


describe("deterministic stress scaffold", () => {
  it("generates all 10 STRESS_PROMPTS ids", () => {
    const projects = generateAllStressScaffoldProjects();
    assert.deepEqual(
      projects.map((p) => p.id),
      STRESS_PROMPTS.map((p) => p.id),
    );
    assert.equal(projects.length, 10);
  });

  it("represents listed pages, minPages, and expected keywords", () => {
    const projects = generateAllStressScaffoldProjects();
    for (const prompt of STRESS_PROMPTS) {
      const project = projects.find((p) => p.id === prompt.id);
      assert.ok(project, prompt.id);
      const listed = pagesForPrompt(prompt);
      assert.ok(listed.length >= prompt.minPages, prompt.id);
      assert.deepEqual(project!.pages, listed);
      const blob = Object.values(project!.files).join("\n").toLowerCase();
      for (const title of listed) {
        assert.ok(blob.includes(title.toLowerCase()), `${prompt.id} missing page ${title}`);
      }
      for (const keyword of prompt.expectedKeywords) {
        assert.ok(
          blob.includes(keyword.toLowerCase()),
          `${prompt.id} missing keyword ${keyword}`,
        );
      }
      assert.ok(project!.files["package.json"]);
      assert.ok(project!.files["src/App.tsx"]);
      assert.ok(project!.files["src/main.tsx"]);
    }
  });

  it("two generations produce identical project bytes and hashes", () => {
    const first = generateAllStressScaffoldProjects();
    const second = generateAllStressScaffoldProjects();
    for (let i = 0; i < first.length; i++) {
      assert.deepEqual(first[i]!.files, second[i]!.files);
      assert.deepEqual(hashScaffoldFiles(first[i]!.files), hashScaffoldFiles(second[i]!.files));
      assert.equal(
        projectBytesFingerprint(first[i]!.files),
        projectBytesFingerprint(second[i]!.files),
      );
    }
  });

  it("does not read the committed legacy or replay-frozen corpora", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bl-scaffold-trap-"));
    const canaries = [
      join(committedLegacyCorpusRoot(), "fleetops-pro", "package.json"),
      join(committedReplayFrozenCorpusRoot(), "fleetops-pro", "package.json"),
    ];
    const previousModes = canaries.map((file) => {
      chmodSync(file, 0);
      return { file, mode: 0o644 };
    });
    try {
      await withCorpusContentReadTrap(async () => {
        generateAllStressScaffoldProjects();
        await writeDeterministicStressScaffolds({
          output: dir,
          overwrite: true,
          operator: "trap-test",
          tool: "test",
          model: "none",
          generatedAt: "2026-01-01T00:00:00.000Z",
        });
      });
    } finally {
      for (const { file, mode } of previousModes) {
        chmodSync(file, mode);
      }
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects corpus output paths by default", () => {
    assert.throws(
      () =>
        resolveScaffoldOutputPath({
          output: join(committedLegacyCorpusRoot(), "replacement"),
        }),
      ScaffoldOutputError,
    );
    assert.throws(
      () =>
        resolveScaffoldOutputPath({
          output: join(committedReplayFrozenCorpusRoot(), "replacement"),
        }),
      ScaffoldOutputError,
    );
  });

  it("rejects path traversal and unsafe broad output targets", () => {
    assert.throws(() => resolveScaffoldOutputPath({ output: null }), ScaffoldOutputError);
    assert.throws(() => resolveScaffoldOutputPath({ output: "" }), ScaffoldOutputError);
    assert.throws(
      () => resolveScaffoldOutputPath({ output: `${tmpdir()}/scaffold-a/../scaffold-b` }),
      ScaffoldOutputError,
    );
    assert.throws(() => resolveScaffoldOutputPath({ output: "/" }), ScaffoldOutputError);
    assert.throws(() => resolveScaffoldOutputPath({ output: repoRoot() }), ScaffoldOutputError);
    assert.throws(
      () => resolveScaffoldOutputPath({ output: join(repoRoot(), "benchmarks/fixtures/stress") }),
      ScaffoldOutputError,
    );
    assert.throws(
      () => resolveScaffoldOutputPath({ output: join(repoRoot(), "docs") }),
      ScaffoldOutputError,
    );
    assert.throws(() => resolveScaffoldOutputPath({ output: tmpdir() }), ScaffoldOutputError);
    assert.throws(() => resolveScaffoldOutputPath({ output: "/tmp" }), ScaffoldOutputError);
  });

  it("rejects symlink aliases into the repository or frozen corpora", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bl-scaffold-symlink-"));
    const repoAlias = join(dir, "repo-alias");
    const legacyAlias = join(dir, "legacy-alias");
    const frozenAlias = join(dir, "frozen-alias");
    const parentAlias = join(dir, "parent-alias");
    symlinkSync(repoRoot(), repoAlias);
    symlinkSync(committedLegacyCorpusRoot(), legacyAlias);
    symlinkSync(committedReplayFrozenCorpusRoot(), frozenAlias);
    symlinkSync(repoRoot(), parentAlias);
    try {
      assert.throws(
        () => resolveScaffoldOutputPath({ output: repoAlias }),
        ScaffoldOutputError,
      );
      assert.throws(
        () => resolveScaffoldOutputPath({ output: legacyAlias }),
        ScaffoldOutputError,
      );
      assert.throws(
        () => resolveScaffoldOutputPath({ output: frozenAlias }),
        ScaffoldOutputError,
      );
      assert.throws(
        () => resolveScaffoldOutputPath({ output: join(parentAlias, "generated-out") }),
        ScaffoldOutputError,
      );
    } finally {
      unlinkSync(repoAlias);
      unlinkSync(legacyAlias);
      unlinkSync(frozenAlias);
      unlinkSync(parentAlias);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not need provider credentials or network calls", () => {
    const sources = [
      "generate.ts",
      "write.ts",
      "outputGuard.ts",
      "parsePromptPages.ts",
      "toolchain.ts",
    ].map(sourceOf).join("\n");
    assert.doesNotMatch(sources, /provider-settings|\.env\b|geminiApiKey|OPENAI_API_KEY|ANTHROPIC|fetch\(|https?:\/\//);
    generateAllStressScaffoldProjects();
  });

  it("protects existing non-empty output directories and overwrites only that directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "bl-scaffold-protect-"));
    const dir = join(parent, "out");
    mkdirSync(dir);
    const sibling = join(parent, "keep.txt");
    await writeFile(sibling, "keep\n");
    await writeFile(join(dir, "stale.txt"), "stale\n");
    try {
      assert.throws(
        () => resolveScaffoldOutputPath({ output: dir }),
        /not empty/,
      );
      const allowed = resolveScaffoldOutputPath({ output: dir, overwrite: true });
      assert.equal(allowed, canonicalizeOutputPath(dir));
      await writeDeterministicStressScaffolds({
        output: dir,
        overwrite: true,
        operator: "overwrite-test",
        tool: "test",
        model: "none",
        generatedAt: "2026-01-01T00:00:00.000Z",
      });
      assert.equal(await readFile(sibling, "utf8"), "keep\n");
      assert.equal(existsSync(join(dir, "stale.txt")), false);
      assert.ok(existsSync(join(dir, "fleetops-pro", "package.json")));
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("writes projects and a timestamped manifest without changing project bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bl-scaffold-write-"));
    try {
      const first = await writeDeterministicStressScaffolds({
        output: dir,
        overwrite: true,
        operator: "test-operator",
        tool: "test-tool",
        model: "none",
        generatedAt: "2026-01-01T00:00:00.000Z",
      });
      assert.equal(first.projects.length, 10);
      const manifest = JSON.parse(await readFile(first.manifestPath, "utf8")) as {
        generatorVersion: string;
        generatedAt: string;
        operator: string;
        tool: string;
        model: string;
        specifications: string[];
        outputRoot: string;
        projects: { id: string; files: Record<string, string>; contentSha256: string }[];
      };
      assert.equal(manifest.operator, "test-operator");
      assert.equal(manifest.generatedAt, "2026-01-01T00:00:00.000Z");
      assert.ok(manifest.specifications.length > 0);
      assert.equal(manifest.projects.length, 10);
      const inMemory = generateAllStressScaffoldProjects();
      for (const project of inMemory) {
        assert.equal(
          manifest.projects.find((row) => row.id === project.id)?.contentSha256,
          projectBytesFingerprint(project.files),
        );
      }
      const secondDir = await mkdtemp(join(tmpdir(), "bl-scaffold-write2-"));
      try {
        const second = await writeDeterministicStressScaffolds({
          output: secondDir,
          overwrite: true,
          operator: "other-operator",
          tool: "other-tool",
          model: "unknown",
          generatedAt: "2026-12-31T23:59:59.000Z",
        });
        for (const project of first.projects) {
          const left = join(first.outputRoot, project.id, "src/App.tsx");
          const right = join(second.outputRoot, project.id, "src/App.tsx");
          assert.equal(await readFile(left, "utf8"), await readFile(right, "utf8"));
        }
        const secondManifest = await readFile(second.manifestPath, "utf8");
        assert.notEqual(first.manifest, secondManifest);
      } finally {
        await rm(secondDir, { recursive: true, force: true });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
