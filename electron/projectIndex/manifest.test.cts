import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  loadManifest,
  MANIFEST_COVERAGE_THRESHOLD,
  saveManifest,
  validateManifestEntries,
} from "./manifest.cjs";
import { scanProject } from "../projectScanner.cjs";
import { applyScanDelta } from "./deltaScanner.cjs";

describe("scan manifest", () => {
  it("validates mtime/size coverage for unchanged files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bl-manifest-"));
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src", "App.tsx"), "export const App = 1;\n");
      const scan = await scanProject(root);
      const saved = await saveManifest(root, scan);
      assert.equal(saved.ok, true);

      const manifest = await loadManifest(root);
      assert.ok(manifest);
      const result = await validateManifestEntries(root, manifest!.files);
      assert.equal(result.changed.length, 0);
      assert.equal(result.deleted.length, 0);
      assert.ok(result.coverage >= MANIFEST_COVERAGE_THRESHOLD);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects changed files when content updates", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bl-manifest-"));
    try {
      const filePath = path.join(root, "note.ts");
      await writeFile(filePath, "export const v = 1;\n");
      const scan = await scanProject(root);
      await saveManifest(root, scan);

      const manifest = await loadManifest(root);
      assert.ok(manifest);
      await writeFile(filePath, "export const v = 2;\n");
      const result = await validateManifestEntries(root, manifest!.files);
      assert.equal(result.changed.length, 1);
      assert.ok(result.coverage < MANIFEST_COVERAGE_THRESHOLD);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("delta scanner", () => {
  it("updates a single file without full rescan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bl-delta-"));
    try {
      const filePath = path.join(root, "src.ts");
      await writeFile(filePath, "export function oldName() {}\n");
      const initial = await scanProject(root);
      await writeFile(filePath, "export function newName() {}\n");
      const next = await applyScanDelta(initial, root, {
        changed: ["src.ts"],
        added: ["src.ts"],
        deleted: [],
      });
      assert.ok(next.symbols.some((s) => s.name === "newName"));
      assert.equal(next.index.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies single-file delta under 400ms on warm scan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bl-delta-perf-"));
    try {
      await mkdir(path.join(root, "pkg"), { recursive: true });
      for (let i = 0; i < 120; i += 1) {
        await writeFile(
          path.join(root, "pkg", `file-${i}.ts`),
          `export const value${i} = ${i};\n`,
        );
      }
      const initial = await scanProject(root);
      const target = path.join(root, "pkg", "file-0.ts");
      await writeFile(target, "export const value0 = 999;\n");
      const started = performance.now();
      await applyScanDelta(initial, root, {
        changed: ["pkg/file-0.ts"],
        added: ["pkg/file-0.ts"],
        deleted: [],
      });
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 400, `delta took ${elapsed.toFixed(1)}ms`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
