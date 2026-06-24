import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { scanProject } from "../projectScanner.cjs";
import {
  buildChunksForPaths,
  patchSemanticChunks,
  removeChunksForPaths,
} from "./incrementalSemantic.cjs";
import { buildTfidfIndex } from "./vectors.cjs";
import { searchSemanticIndex } from "./search.cjs";

describe("incremental semantic index", () => {
  it("removeChunksForPaths drops only targeted files", () => {
    const chunks = [
      {
        id: "a#1",
        path: "src/a.ts",
        startLine: 1,
        endLine: 2,
        text: "export const alpha = 1",
        symbolName: null,
      },
      {
        id: "b#1",
        path: "src/b.ts",
        startLine: 1,
        endLine: 2,
        text: "export const beta = 2",
        symbolName: null,
      },
    ];
    const next = removeChunksForPaths(chunks, ["src/a.ts"]);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.path, "src/b.ts");
  });

  it("patchSemanticChunks updates changed file text", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bl-sem-delta-"));
    try {
      const filePath = path.join(root, "widget.ts");
      await writeFile(filePath, "export function oldWidget() {}\n");
      const scan = await scanProject(root);
      const readText = async (abs: string) => {
        try {
          return await (await import("node:fs/promises")).readFile(abs, "utf8");
        } catch {
          return null;
        }
      };
      const initial = await buildChunksForPaths(scan, ["widget.ts"], readText);
      await writeFile(filePath, "export function newWidget() {}\n");
      const scan2 = await scanProject(root);
      const patched = await patchSemanticChunks(
        initial,
        scan2,
        { changed: ["widget.ts"], added: ["widget.ts"], deleted: [] },
        readText,
      );
      assert.ok(patched.some((c) => c.text.includes("newWidget")));
      assert.equal(patched.filter((c) => c.path === "widget.ts").length, patched.length);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("patch + tfidf preserves search quality for updated symbol", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bl-sem-search-"));
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      const target = path.join(root, "src", "Dashboard.tsx");
      const other = path.join(root, "src", "Home.tsx");
      await writeFile(target, "export function Dashboard() { return null }\n");
      await writeFile(other, "export function Home() { return null }\n");
      const scan = await scanProject(root);
      const readText = async (abs: string) => {
        try {
          return await (await import("node:fs/promises")).readFile(abs, "utf8");
        } catch {
          return null;
        }
      };
      const initial = await buildChunksForPaths(
        scan,
        ["src/Dashboard.tsx", "src/Home.tsx"],
        readText,
      );
      await writeFile(
        target,
        "export function Dashboard() { return <main>Revenue chart</main> }\n",
      );
      const scan2 = await scanProject(root);
      const patched = await patchSemanticChunks(
        initial,
        scan2,
        { changed: ["src/Dashboard.tsx"], added: ["src/Dashboard.tsx"], deleted: [] },
        readText,
      );
      const tfidf = buildTfidfIndex(patched);
      const hits = searchSemanticIndex("revenue chart dashboard", patched, tfidf, 3);
      assert.ok(hits.length > 0);
      assert.equal(hits[0]?.path, "src/Dashboard.tsx");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("semantic delta on warm chunks completes under 400ms", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bl-sem-perf-"));
    try {
      await mkdir(path.join(root, "pkg"), { recursive: true });
      for (let i = 0; i < 120; i += 1) {
        await writeFile(
          path.join(root, "pkg", `m-${i}.ts`),
          `export const value${i} = ${i};\n`,
        );
      }
      const scan = await scanProject(root);
      const readText = async (abs: string) => {
        try {
          return await (await import("node:fs/promises")).readFile(abs, "utf8");
        } catch {
          return null;
        }
      };
      const initial = await buildChunksForPaths(
        scan,
        scan.files.map((f) => f.path),
        readText,
      );
      const tfidfBefore = buildTfidfIndex(initial);
      assert.ok(tfidfBefore.chunkCount > 0);

      await writeFile(path.join(root, "pkg", "m-0.ts"), "export const value0 = 999;\n");
      const scan2 = await scanProject(root);
      const started = performance.now();
      const patched = await patchSemanticChunks(
        initial,
        scan2,
        { changed: ["pkg/m-0.ts"], added: ["pkg/m-0.ts"], deleted: [] },
        readText,
      );
      buildTfidfIndex(patched);
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 400, `semantic delta took ${elapsed.toFixed(1)}ms`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
