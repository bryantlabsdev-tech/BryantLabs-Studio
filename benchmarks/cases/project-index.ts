import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(fileURLToPath(import.meta.url));
const {
  loadManifest,
  saveManifest,
  validateManifestEntries,
} = require("../../dist-electron/projectIndex/manifest.cjs") as typeof import("../../electron/projectIndex/manifest.cts");
const { scanProject } = require("../../dist-electron/projectScanner.cjs") as typeof import("../../electron/projectScanner.cts");
const { applyScanDelta } = require("../../dist-electron/projectIndex/deltaScanner.cjs") as typeof import("../../electron/projectIndex/deltaScanner.cts");
const {
  buildChunksForPaths,
  patchSemanticChunks,
} = require("../../dist-electron/semanticIndex/incrementalSemantic.cjs") as typeof import("../../electron/semanticIndex/incrementalSemantic.cts");
const { buildTfidfIndex } = require("../../dist-electron/semanticIndex/vectors.cjs") as typeof import("../../electron/semanticIndex/vectors.cts");
const { searchSemanticIndex } = require("../../dist-electron/semanticIndex/search.cjs") as typeof import("../../electron/semanticIndex/search.cts");
const { DEFAULT_MAX_EXPLORE_FILES, exploreRepositoryBeforeEdit } = require("../../src/core/agent/editExploration.ts") as typeof import("../../src/core/agent/editExploration.ts");
const { buildRepositoryIndex } = require("../../src/core/repository/buildIndex.ts") as typeof import("../../src/core/repository/buildIndex.ts");
const { mockProjectScan } = require("../../src/core/repository/testScan.ts") as typeof import("../../src/core/repository/testScan.ts");

async function createLargeRepo(root: string, fileCount: number): Promise<void> {
  await mkdir(path.join(root, "src"), { recursive: true });
  for (let i = 0; i < fileCount; i += 1) {
    await writeFile(
      path.join(root, "src", `module-${i}.ts`),
      `export const n${i} = ${i};\n`,
    );
  }
}

export const PROJECT_INDEX_CASES = [
  {
    id: "project_index.warm_open",
    category: "project_index" as const,
    name: "Warm open from manifest cache",
    description: "Loading a persisted manifest returns scan without full walk.",
    weight: 1,
  },
  {
    id: "project_index.single_file_delta",
    category: "project_index" as const,
    name: "Single-file edit index refresh",
    description: "Delta scan updates one file in under 400ms.",
    weight: 1,
  },
  {
    id: "project_index.delta_scan_perf",
    category: "project_index" as const,
    name: "Delta scan performance",
    description: "Delta scan on 200-file repo completes under 400ms.",
    weight: 1,
  },
  {
    id: "project_index.manifest_validation_perf",
    category: "project_index" as const,
    name: "Manifest validation performance",
    description: "mtime/size validation on 200-file manifest under 400ms.",
    weight: 1,
  },
  {
    id: "project_index.semantic_delta_refresh",
    category: "project_index" as const,
    name: "Semantic delta refresh",
    description: "TF-IDF semantic patch for a single file edit under 400ms.",
    weight: 1,
  },
  {
    id: "project_index.semantic_search_regression",
    category: "project_index" as const,
    name: "Semantic search after delta",
    description: "Patched semantic index still ranks the edited file for its query.",
    weight: 1,
  },
  {
    id: "project_index.explore_file_budget",
    category: "project_index" as const,
    name: "Agent pre-explore file budget",
    description: "Pre-edit exploration reads up to 10 ranked files.",
    weight: 1,
  },
];

async function runCase(
  def: (typeof PROJECT_INDEX_CASES)[number],
  run: () => Promise<import("../types").BenchmarkCheck[]>,
): Promise<import("../types").BenchmarkCaseResult> {
  const started = performance.now();
  try {
    const checks = await run();
    const passed = checks.every((c) => c.passed);
    return {
      ...def,
      passed,
      durationMs: Math.round(performance.now() - started),
      checks,
    };
  } catch (err) {
    return {
      ...def,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function check(
  id: string,
  label: string,
  passed: boolean,
  expected?: string,
  actual?: string,
): import("../types").BenchmarkCheck {
  return { id, label, passed, expected, actual };
}

export async function runProjectIndexCase(
  def: (typeof PROJECT_INDEX_CASES)[number],
): Promise<import("../types").BenchmarkCaseResult> {
  switch (def.id) {
    case "project_index.warm_open":
      return runCase(def, async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bl-bench-open-"));
        try {
          await createLargeRepo(root, 200);
          const scan = await scanProject(root);
          await saveManifest(root, scan);
          const started = performance.now();
          const manifest = await loadManifest(root);
          const elapsed = performance.now() - started;
          return [
            check("manifest", "Manifest loads", manifest !== null, "loaded", manifest ? "loaded" : "null"),
            check("scan", "Scan embedded", Boolean(manifest?.scan), "true", String(Boolean(manifest?.scan))),
            check("time", "Warm open under 4s", elapsed < 4000, "<4000ms", `${elapsed.toFixed(1)}ms`),
          ];
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      });

    case "project_index.single_file_delta":
      return runCase(def, async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bl-bench-delta-"));
        try {
          await writeFile(path.join(root, "only.ts"), "export const a = 1;\n");
          const initial = await scanProject(root);
          await writeFile(path.join(root, "only.ts"), "export const a = 2;\n");
          const started = performance.now();
          const next = await applyScanDelta(initial, root, {
            changed: ["only.ts"],
            added: ["only.ts"],
            deleted: [],
          });
          const elapsed = performance.now() - started;
          return [
            check("delta", "Delta completes", next.index.length === 1, "1", String(next.index.length)),
            check("time", "Under 400ms", elapsed < 400, "<400ms", `${elapsed.toFixed(1)}ms`),
          ];
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      });

    case "project_index.delta_scan_perf":
      return runCase(def, async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bl-bench-delta200-"));
        try {
          await createLargeRepo(root, 200);
          const initial = await scanProject(root);
          await writeFile(path.join(root, "src", "module-0.ts"), "export const n0 = 999;\n");
          const started = performance.now();
          await applyScanDelta(initial, root, {
            changed: ["src/module-0.ts"],
            added: ["src/module-0.ts"],
            deleted: [],
          });
          const elapsed = performance.now() - started;
          return [
            check("time", "Delta under 400ms", elapsed < 400, "<400ms", `${elapsed.toFixed(1)}ms`),
          ];
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      });

    case "project_index.manifest_validation_perf":
      return runCase(def, async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bl-bench-validate-"));
        try {
          await createLargeRepo(root, 200);
          const scan = await scanProject(root);
          await saveManifest(root, scan);
          const manifest = await loadManifest(root);
          assert.ok(manifest);
          const started = performance.now();
          const result = await validateManifestEntries(root, manifest.files);
          const elapsed = performance.now() - started;
          return [
            check("coverage", "Full coverage", result.coverage >= 0.95, ">=0.95", result.coverage.toFixed(3)),
            check("time", "Validation under 400ms", elapsed < 400, "<400ms", `${elapsed.toFixed(1)}ms`),
          ];
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      });

    case "project_index.semantic_delta_refresh":
      return runCase(def, async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bl-bench-sem-delta-"));
        try {
          await mkdir(path.join(root, "src"), { recursive: true });
          for (let i = 0; i < 80; i += 1) {
            await writeFile(
              path.join(root, "src", `f-${i}.ts`),
              `export const n${i} = ${i};\n`,
            );
          }
          const scan = await scanProject(root);
          const readText = async (abs: string) =>
            (await import("node:fs/promises")).readFile(abs, "utf8");
          const chunks = await buildChunksForPaths(
            scan,
            scan.files.map((f) => f.path),
            readText,
          );
          await writeFile(path.join(root, "src", "f-0.ts"), "export const n0 = 999;\n");
          const scan2 = await scanProject(root);
          const started = performance.now();
          const patched = await patchSemanticChunks(
            chunks,
            scan2,
            { changed: ["src/f-0.ts"], added: ["src/f-0.ts"], deleted: [] },
            readText,
          );
          buildTfidfIndex(patched);
          const elapsed = performance.now() - started;
          return [
            check("chunks", "Patches chunks", patched.length > 0, ">0", String(patched.length)),
            check("time", "Under 400ms", elapsed < 400, "<400ms", `${elapsed.toFixed(1)}ms`),
          ];
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      });

    case "project_index.semantic_search_regression":
      return runCase(def, async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bl-bench-sem-hit-"));
        try {
          await mkdir(path.join(root, "src"), { recursive: true });
          await writeFile(
            path.join(root, "src", "Billing.ts"),
            "export function Billing() { return null }\n",
          );
          await writeFile(
            path.join(root, "src", "Home.ts"),
            "export function Home() { return null }\n",
          );
          const scan = await scanProject(root);
          const readText = async (abs: string) =>
            (await import("node:fs/promises")).readFile(abs, "utf8");
          let chunks = await buildChunksForPaths(
            scan,
            ["src/Billing.ts", "src/Home.ts"],
            readText,
          );
          await writeFile(
            path.join(root, "src", "Billing.ts"),
            "export function Billing() { return <section>invoice totals</section> }\n",
          );
          const scan2 = await scanProject(root);
          chunks = await patchSemanticChunks(
            chunks,
            scan2,
            { changed: ["src/Billing.ts"], added: ["src/Billing.ts"], deleted: [] },
            readText,
          );
          const tfidf = buildTfidfIndex(chunks);
          const hits = searchSemanticIndex("invoice totals billing", chunks, tfidf, 3);
          return [
            check("hits", "Returns results", hits.length > 0, ">0", String(hits.length)),
            check(
              "path",
              "Ranks edited file",
              hits[0]?.path === "src/Billing.ts",
              "src/Billing.ts",
              hits[0]?.path ?? "—",
            ),
          ];
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      });

    case "project_index.explore_file_budget":
      return runCase(def, async () => {
        const paths = Array.from({ length: 14 }, (_, i) => `src/mod-${i}.ts`);
        const scan = mockProjectScan(paths, { root: "/tmp/explore" });
        const repository = buildRepositoryIndex(scan);
        const explored = await exploreRepositoryBeforeEdit({
          api: {
            readFile: async () => ({ readable: true, content: "export {}\n" }),
            semanticSearch: async () =>
              paths.map((path, index) => ({
                path,
                score: 1 - index * 0.01,
                reason: "bench",
              })),
          } as never,
          projectRoot: "/tmp/explore",
          repository,
          prompt: "refactor exports",
        });
        return [
          check(
            "budget",
            "Reads 10 files",
            explored.length === DEFAULT_MAX_EXPLORE_FILES,
            String(DEFAULT_MAX_EXPLORE_FILES),
            String(explored.length),
          ),
          check(
            "constant",
            "Budget is 10",
            DEFAULT_MAX_EXPLORE_FILES === 10,
            "10",
            String(DEFAULT_MAX_EXPLORE_FILES),
          ),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown project_index case: ${def.id}`,
      };
  }
}

export async function runAllProjectIndexCases(): Promise<
  import("../types").BenchmarkCaseResult[]
> {
  const results = [];
  for (const def of PROJECT_INDEX_CASES) {
    results.push(await runProjectIndexCase(def));
  }
  return results;
}
