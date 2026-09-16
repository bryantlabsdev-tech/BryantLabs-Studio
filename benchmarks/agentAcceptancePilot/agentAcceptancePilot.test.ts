import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createPilotTrial } from "./createTrial.ts";
import { cleanupTrial, evaluateTrial, readTrialManifest } from "./evaluate.ts";
import { copyFixtureTree, fixturesRoot, removeExactHarnessDirs, repoRootFromHarness, shouldSkipCopyEntry } from "./fs.ts";
import {
  buildScorecardEntry,
  formatMetric,
  unavailableMetric,
  validateScorecard,
  writeScorecard,
  summarizeScorecards,
} from "./scorecard.ts";
import { canonicalPrompt, PILOT_TASKS } from "./tasks.ts";

const REPO_ROOT = repoRootFromHarness();
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const SHARED_APP = join(fixturesRoot(), "shared", "src", "App.tsx");

async function withTrial(
  taskId: string,
  fn: (trialRoot: string, projectDir: string) => Promise<void>,
): Promise<void> {
  const created = await createPilotTrial({ taskId, product: "studio" });
  try {
    await fn(created.manifest.trialRoot, created.manifest.projectDir);
  } finally {
    await cleanupTrial(created.manifest.trialRoot).catch(() => undefined);
  }
}

describe("agent acceptance pilot harness", () => {
  it("defines five tasks and product-independent prompts", () => {
    assert.equal(PILOT_TASKS.length, 5);
    assert.equal(new Set(PILOT_TASKS.map((t) => t.canonicalPrompt)).size, 5);
    assert.equal(canonicalPrompt("G1"), canonicalPrompt("G1"));
  });

  it("skips node_modules, dist, studio metadata, git history, credentials, and test results", async () => {
    const src = await mkdtemp(join(tmpdir(), "bl-pilot-copy-src-"));
    const dest = await mkdtemp(join(tmpdir(), "bl-pilot-copy-dest-"));
    try {
      await mkdir(join(src, "src"), { recursive: true });
      await writeFile(join(src, "src", "ok.ts"), "export {}\n", "utf8");
      await mkdir(join(src, "node_modules", "pkg"), { recursive: true });
      await writeFile(join(src, "node_modules", "pkg", "index.js"), "stolen\n", "utf8");
      await mkdir(join(src, "dist"), { recursive: true });
      await writeFile(join(src, "dist", "out.js"), "built\n", "utf8");
      await mkdir(join(src, ".bryantlabs"), { recursive: true });
      await writeFile(join(src, ".bryantlabs", "cache.json"), "{}\n", "utf8");
      await mkdir(join(src, ".git", "objects"), { recursive: true });
      await writeFile(join(src, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
      await writeFile(join(src, "credentials.json"), "{\"secret\":1}\n", "utf8");
      await writeFile(join(src, ".env"), "KEY=1\n", "utf8");
      await mkdir(join(src, "test-results"), { recursive: true });
      await writeFile(join(src, "test-results", "log.txt"), "nope\n", "utf8");
      await copyFixtureTree(src, dest);
      assert.equal(existsSync(join(dest, "src", "ok.ts")), true);
      assert.equal(existsSync(join(dest, "node_modules")), false);
      assert.equal(existsSync(join(dest, "dist")), false);
      assert.equal(existsSync(join(dest, ".bryantlabs")), false);
      assert.equal(existsSync(join(dest, ".git")), false);
      assert.equal(existsSync(join(dest, "credentials.json")), false);
      assert.equal(existsSync(join(dest, ".env")), false);
      assert.equal(existsSync(join(dest, "test-results")), false);
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(src, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("classifies skip names before copying", () => {
    assert.equal(shouldSkipCopyEntry("node_modules", "node_modules"), true);
    assert.equal(shouldSkipCopyEntry("ok.ts", "src/ok.ts"), false);
  });

  it("creates trials under os.tmpdir with sealed identity", async () => {
    const studio = await createPilotTrial({ taskId: "G1", product: "studio" });
    const reference = await createPilotTrial({ taskId: "G1", product: "reference" });
    try {
      assert.equal(studio.prompt, reference.prompt);
      assert.equal(studio.manifest.product, "studio");
      assert.equal(reference.manifest.product, "reference");
      const tmpReal = await realpath(tmpdir());
      assert.equal((await realpath(studio.manifest.trialRoot)).startsWith(tmpReal), true);
      const reloaded = await readTrialManifest(studio.manifest.trialRoot);
      assert.equal(reloaded.integrity, studio.manifest.integrity);
    } finally {
      await cleanupTrial(studio.manifest.trialRoot);
      await cleanupTrial(reference.manifest.trialRoot);
    }
  });

  it("rejects missing, malformed, and edited manifests", async () => {
    const created = await createPilotTrial({ taskId: "G1", product: "studio" });
    const manifestPath = join(created.manifest.trialRoot, "MANIFEST.json");
    try {
      const raw = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      raw.product = "reference";
      await writeFile(manifestPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      await assert.rejects(() => evaluateTrial(created.manifest.trialRoot, { runVerify: false }), /integrity|directory name|task\/product/);
      await writeFile(manifestPath, "{not json", "utf8");
      await assert.rejects(() => readTrialManifest(created.manifest.trialRoot), /valid JSON/);
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(created.manifest.trialRoot, { recursive: true, force: true });
    }
  });

  it("prints the exact canonical prompt on stdout", () => {
    const script = join(REPO_ROOT, "scripts", "agent-acceptance-pilot.mjs");
    const hook = join(REPO_ROOT, "scripts", "test-alias-hook.mjs");
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--import", hook, script, "prompt", "--task", "U1"],
      { encoding: "utf8", cwd: REPO_ROOT },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${canonicalPrompt("U1")}\n`);
  });

  it("fails G1 on the placeholder and passes after calculator UI is added", async () => {
    await withTrial("G1", async (trialRoot, projectDir) => {
      const before = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(before.passed, false);
      await copyFile(SHARED_APP, join(projectDir, "src", "App.tsx"));
      const after = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(after.passed, true, after.checks.filter((c) => !c.passed).map((c) => c.id).join(", "));
    });
  });

  it("fails R1 until HistoryItem is extracted while App still uses History", async () => {
    await withTrial("R1", async (trialRoot, projectDir) => {
      const before = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(before.passed, false);
      await writeFile(
        join(projectDir, "src", "components", "History.tsx"),
        `function HistoryItem({ entry }: { entry: string }) {
  const formatted = entry.trim() || "(empty)";
  return <li><span>{formatted}</span></li>;
}

export function History({ entries }: { entries: string[] }) {
  return (
    <section aria-label="calculation history">
      <h2>History</h2>
      <ul>{entries.slice(-10).map((entry, i) => <HistoryItem key={i} entry={entry} />)}</ul>
    </section>
  );
}
`,
        "utf8",
      );
      const after = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(after.passed, true, after.checks.filter((c) => !c.passed).map((c) => c.id).join(", "));
    });
  });

  it("fails D1 until the planted type error is removed", async () => {
    await withTrial("D1", async (trialRoot, projectDir) => {
      const before = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(before.passed, false);
      const math = await readFile(join(projectDir, "src", "math.ts"), "utf8");
      await writeFile(
        join(projectDir, "src", "math.ts"),
        math.replace(/\nexport const PLANTED_ERROR: number = "not-a-number";\n/, "\n"),
        "utf8",
      );
      const after = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(after.passed, true, after.checks.filter((c) => !c.passed).map((c) => c.id).join(", "));
    });
  });

  it("U1 post-review evaluator requires History use and rejects timer leftovers", async () => {
    await withTrial("U1", async (trialRoot, projectDir) => {
      const before = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(before.passed, false);
      await mkdir(join(projectDir, "src", "components"), { recursive: true });
      await writeFile(
        join(projectDir, "src", "components", "History.tsx"),
        `export function History({ entries }: { entries: string[] }) {
  return <section aria-label="calculation history"><ul>{entries.map((e) => <li key={e}>{e}</li>)}</ul></section>;
}
`,
        "utf8",
      );
      const app = await readFile(join(projectDir, "src", "App.tsx"), "utf8");
      await writeFile(
        join(projectDir, "src", "App.tsx"),
        `import { History } from "./components/History";\n${app.replace("</main>", "      <History entries={[]} />\n    </main>")}`,
        "utf8",
      );
      const historyOnly = await evaluateTrial(trialRoot, { runVerify: false });
      assert.equal(historyOnly.passed, true, historyOnly.checks.filter((c) => !c.passed).map((c) => c.id).join(", "));
      await writeFile(join(projectDir, "src", "components", "Timer.tsx"), `export function Timer() { return <h2>Timer</h2>; }\n`, "utf8");
      assert.equal((await evaluateTrial(trialRoot, { runVerify: false })).passed, false);
    });
  });

  it("F1 fails on any outside snapshot divergence and unlinks rather than following cleanup symlinks", async () => {
    const created = await createPilotTrial({ taskId: "F1", product: "studio" });
    const decoy = await mkdtemp(join(tmpdir(), "bl-pilot-decoy-"));
    await writeFile(join(decoy, "keep.txt"), "stay\n", "utf8");
    await symlink(decoy, join(created.manifest.projectDir, "escape-link"));
    try {
      assert.equal((await evaluateTrial(created.manifest.trialRoot, { runVerify: false })).passed, true);
      await writeFile(created.manifest.sentinelPath!, "PWNED\n", "utf8");
      const escaped = await evaluateTrial(created.manifest.trialRoot, { runVerify: false });
      assert.equal(escaped.passed, false);
      assert.ok(escaped.checks.some((c) => c.id === "outside-paths-integrity" && !c.passed));
      await writeFile(created.manifest.sentinelPath!, "untouched\n", "utf8");
      assert.equal((await evaluateTrial(created.manifest.trialRoot, { runVerify: false })).passed, true);
      await cleanupTrial(created.manifest.trialRoot);
      assert.equal(existsSync(created.manifest.trialRoot), false);
      assert.equal(await readFile(join(decoy, "keep.txt"), "utf8"), "stay\n");
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(created.manifest.trialRoot, { recursive: true, force: true }).catch(() => undefined);
      if (created.manifest.outsideDir) {
        await rm(created.manifest.outsideDir, { recursive: true, force: true }).catch(() => undefined);
      }
      await rm(decoy, { recursive: true, force: true });
    }
  });

  it("refuses cleanup of the repository and unresolved paths", async () => {
    await assert.rejects(
      () => removeExactHarnessDirs([REPO_ROOT], { repoRoot: REPO_ROOT }),
      /protected|repository|tmpdir/,
    );
    await assert.rejects(
      () => removeExactHarnessDirs([join(tmpdir(), "bl-pilot-does-not-exist")], { repoRoot: REPO_ROOT }),
      /not created by this trial|unresolved/,
    );
  });

  it("stores omitted metrics as unavailable and cannot record pass when evaluation failed", () => {
    const failed = {
      taskId: "G1" as const,
      product: "studio" as const,
      trialRoot: "/tmp/example",
      passed: false,
      checks: [],
      unexpectedChangedPaths: ["secret.env"],
      typecheck: { ran: false, ok: null },
      build: { ran: false, ok: null },
    };
    const entry = buildScorecardEntry({
      evaluation: failed,
      model: "unspecified",
      wallTimeMs: 12,
      repairAttempts: 0,
      humanInterventions: 0,
      notes: "",
      transcriptOrRunReference: "run-1",
    });
    assert.equal(entry.passed, false);
    assert.equal(entry.evaluationPassed, false);
    assert.deepEqual(entry.apiCalls, unavailableMetric());
    assert.equal(formatMetric(entry.apiCalls), "unavailable");
    assert.throws(() => validateScorecard({ ...entry, passed: true, evaluationPassed: false }));
    const dualEdit = validateScorecard({ ...entry, passed: true, evaluationPassed: true });
    assert.equal(dualEdit.passed, true);
  });

  it("summarizes recorded scorecards without turning unavailable into zero", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bl-pilot-scores-"));
    const { rm } = await import("node:fs/promises");
    try {
      const entry = buildScorecardEntry({
        evaluation: {
          taskId: "G1",
          product: "reference",
          trialRoot: dir,
          passed: false,
          checks: [],
          unexpectedChangedPaths: ["secret.env"],
          typecheck: { ran: false, ok: null },
          build: { ran: false, ok: null },
        },
        model: "test-model",
        wallTimeMs: 9,
        repairAttempts: 1,
        humanInterventions: 2,
        notes: "n/a metrics",
        transcriptOrRunReference: "abc",
      });
      await writeScorecard(join(dir, "g1-reference.json"), entry);
      const { markdown } = await summarizeScorecards(dir);
      assert.match(markdown, /unavailable/);
      assert.match(markdown, /fail/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not read provider keys from harness sources", async () => {
    const files = ["cli.ts", "createTrial.ts", "evaluate.ts", "scorecard.ts", "tasks.ts", "fs.ts"];
    for (const name of files) {
      const text = await readFile(join(THIS_DIR, name), "utf8");
      assert.doesNotMatch(text, /GEMINI_API_KEY|OPENAI_API_KEY|process\.env\.\w*KEY/);
    }
  });
});
