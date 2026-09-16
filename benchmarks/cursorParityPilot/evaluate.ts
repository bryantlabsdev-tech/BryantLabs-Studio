import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, realpath, symlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import {
  diffSnapshots,
  exists,
  isInside,
  removeExactHarnessDirs,
  repoRootFromHarness,
  sha256Text,
  snapshotDirectory,
  snapshotsEqual,
} from "./fs.ts";
import { manifestIntegrity, trialDirIdentity } from "./createTrial.ts";
import { getPilotTask } from "./tasks.ts";
import type {
  ContentNeedle,
  DirectorySnapshot,
  EvaluationCheck,
  FileSnapshotEntry,
  TrialEvaluation,
  TrialManifest,
} from "./types.ts";
import { MANIFEST_VERSION, PILOT_PRODUCTS, PILOT_TASK_IDS } from "./types.ts";
import { ManifestError } from "./createTrial.ts";

export { ManifestError };

export async function readTrialManifest(trialRoot: string): Promise<TrialManifest> {
  const manifestPath = join(trialRoot, "MANIFEST.json");
  if (!exists(manifestPath)) {
    throw new ManifestError(`Missing MANIFEST.json in ${trialRoot}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new ManifestError("MANIFEST.json is not valid JSON");
  }
  const manifest = parseManifestShape(parsed);
  const fromDir = trialDirIdentity(trialRoot);
  if (manifest.taskId !== fromDir.taskId || manifest.product !== fromDir.product) {
    throw new ManifestError("Manifest task/product does not match the trial directory name");
  }
  const requested = await realpath(trialRoot);
  const recorded = await realpath(manifest.trialRoot);
  if (requested !== recorded) {
    throw new ManifestError("Manifest trialRoot does not match the directory being evaluated");
  }
  if (manifest.projectDir !== join(manifest.trialRoot, "project")) {
    throw new ManifestError("Manifest projectDir must be <trialRoot>/project");
  }
  const { integrity, ...unsigned } = manifest;
  if (manifestIntegrity(unsigned) !== integrity) {
    throw new ManifestError("Manifest integrity check failed (missing, malformed, or edited)");
  }
  if (!manifest.harnessCreatedDirs.includes(manifest.trialRoot)) {
    throw new ManifestError("Manifest harnessCreatedDirs must include trialRoot");
  }
  const tmpReal = await realpath(tmpdir());
  for (const dir of manifest.harnessCreatedDirs) {
    let resolved: string;
    try {
      resolved = await realpath(dir);
    } catch {
      throw new ManifestError(`Manifest lists an unresolved harness path: ${dir}`);
    }
    if (!isInside(resolved, tmpReal) && resolved !== tmpReal) {
      throw new ManifestError(`Manifest lists a path outside tmpdir: ${dir}`);
    }
  }
  return manifest;
}

function parseManifestShape(raw: unknown): TrialManifest {
  if (typeof raw !== "object" || raw === null) throw new ManifestError("Manifest must be an object");
  const obj = raw as Record<string, unknown>;
  if (obj.version !== MANIFEST_VERSION) throw new ManifestError("Unsupported manifest version");
  if (typeof obj.taskId !== "string" || !(PILOT_TASK_IDS as readonly string[]).includes(obj.taskId)) {
    throw new ManifestError("Invalid taskId");
  }
  if (typeof obj.product !== "string" || !(PILOT_PRODUCTS as readonly string[]).includes(obj.product)) {
    throw new ManifestError("Invalid product");
  }
  const str = (key: string): string => {
    const value = obj[key];
    if (typeof value !== "string" || !value) throw new ManifestError(`Invalid ${key}`);
    return value;
  };
  const strOrNull = (key: string): string | null => {
    const value = obj[key];
    if (value === null) return null;
    if (typeof value !== "string" || !value) throw new ManifestError(`Invalid ${key}`);
    return value;
  };
  if (!Array.isArray(obj.harnessCreatedDirs) || obj.harnessCreatedDirs.some((d) => typeof d !== "string")) {
    throw new ManifestError("Invalid harnessCreatedDirs");
  }
  return {
    version: MANIFEST_VERSION,
    taskId: obj.taskId as TrialManifest["taskId"],
    product: obj.product as TrialManifest["product"],
    createdAt: str("createdAt"),
    trialRoot: str("trialRoot"),
    projectDir: str("projectDir"),
    openPath: str("openPath"),
    outsideDir: strOrNull("outsideDir"),
    sentinelPath: strOrNull("sentinelPath"),
    sentinelSha256: strOrNull("sentinelSha256"),
    harnessCreatedDirs: obj.harnessCreatedDirs as string[],
    projectSnapshot: parseSnapshot(obj.projectSnapshot, "projectSnapshot"),
    outsideSnapshot: obj.outsideSnapshot === null ? null : parseSnapshot(obj.outsideSnapshot, "outsideSnapshot"),
    integrity: str("integrity"),
  };
}

function parseSnapshot(raw: unknown, label: string): DirectorySnapshot {
  if (typeof raw !== "object" || raw === null) throw new ManifestError(`Invalid ${label}`);
  const obj = raw as Record<string, unknown>;
  if (obj.rootKind !== "dir" && obj.rootKind !== "symlink") throw new ManifestError(`Invalid ${label}.rootKind`);
  if (!Array.isArray(obj.entries)) throw new ManifestError(`Invalid ${label}.entries`);
  const entries: FileSnapshotEntry[] = obj.entries.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) throw new ManifestError(`Invalid ${label}.entries[${i}]`);
    const rec = entry as Record<string, unknown>;
    if (typeof rec.relPath !== "string" || (rec.kind !== "file" && rec.kind !== "dir" && rec.kind !== "symlink")) {
      throw new ManifestError(`Invalid ${label}.entries[${i}]`);
    }
    return {
      relPath: rec.relPath,
      kind: rec.kind,
      ...(typeof rec.sha256 === "string" ? { sha256: rec.sha256 } : {}),
      ...(typeof rec.linkTarget === "string" ? { linkTarget: rec.linkTarget } : {}),
    };
  });
  return { rootKind: obj.rootKind, entries };
}

export async function evaluateTrial(
  trialRoot: string,
  options: { readonly runVerify?: boolean } = {},
): Promise<TrialEvaluation> {
  const manifest = await readTrialManifest(trialRoot);
  const task = getPilotTask(manifest.taskId);
  const runVerify = options.runVerify ?? true;
  const checks: EvaluationCheck[] = [];
  const projectDir = manifest.projectDir;
  const sources = await readSourceFiles(projectDir);

  for (const rel of task.requiredFiles) {
    const present = exists(join(projectDir, rel));
    checks.push(check(`required-file:${rel}`, `Required file ${rel}`, present, "exists", present ? "exists" : "missing"));
  }
  for (const rel of task.forbiddenFiles) {
    const present = exists(join(projectDir, rel));
    checks.push(check(`forbidden-file:${rel}`, `Forbidden file ${rel} absent`, !present, "absent", present ? "exists" : "absent"));
  }
  for (const needle of task.requiredContent) {
    const found = matchNeedle(sources, needle);
    checks.push(check(`required-content:${needle.id}`, `Required behavior ${needle.id}`, found, `/${needle.pattern}/`, found ? "matched" : "not matched"));
  }
  for (const needle of task.forbiddenContent) {
    const found = matchNeedle(sources, needle);
    checks.push(check(`forbidden-content:${needle.id}`, `Forbidden behavior ${needle.id} absent`, !found, "absent", found ? "matched" : "absent"));
  }

  const afterProject = await snapshotDirectory(projectDir);
  const projectDiff = diffSnapshots(manifest.projectSnapshot, afterProject);
  const afterByRel = new Map(afterProject.entries.map((e) => [e.relPath, e]));
  const beforeByRel = new Map(manifest.projectSnapshot.entries.map((e) => [e.relPath, e]));
  const changedPaths = [...projectDiff.added, ...projectDiff.removed, ...projectDiff.changed];
  const unexpectedChangedPaths: string[] = [];
  const projectReal = await realpath(projectDir);

  for (const rel of changedPaths) {
    const afterEntry = afterByRel.get(rel);
    const beforeEntry = beforeByRel.get(rel);
    if (afterEntry?.kind === "dir" || (afterEntry == null && beforeEntry?.kind === "dir")) continue;
    const abs = join(projectDir, rel);
    let resolved = abs;
    try {
      resolved = await realpath(abs);
    } catch {
      resolved = abs;
    }
    if (manifest.outsideDir) {
      const outsideReal = await realpath(manifest.outsideDir);
      if (isInside(resolved, outsideReal)) {
        unexpectedChangedPaths.push(rel);
        continue;
      }
    }
    if (!isInside(resolved, projectReal) && !isInside(abs, projectDir)) {
      unexpectedChangedPaths.push(rel);
      continue;
    }
    if (task.checkOutsideSentinel) continue;
    if (!pathAllowed(rel, task.allowedChangedPathRules)) unexpectedChangedPaths.push(rel);
  }

  checks.push(
    check(
      "allowed-changed-paths",
      "Changed paths stay within the allow list versus the sealed create-time snapshot",
      unexpectedChangedPaths.length === 0,
      "no unexpected paths",
      unexpectedChangedPaths.length === 0 ? "none" : unexpectedChangedPaths.join(", "),
    ),
  );

  let typecheck: TrialEvaluation["typecheck"] = { ran: false, ok: null };
  let build: TrialEvaluation["build"] = { ran: false, ok: null };
  if (runVerify && task.runTypecheck) {
    const result = await runRepoTsc(projectDir);
    typecheck = { ran: true, ok: result.ok, output: result.output };
    checks.push(check("typecheck", "Typecheck passes", result.ok, "exit 0", result.ok ? "exit 0" : `exit ${result.exitCode}`));
  }
  if (runVerify && task.runBuild) {
    const result = await runRepoViteBuild(projectDir);
    build = { ran: true, ok: result.ok, output: result.output };
    checks.push(check("build", "Build passes", result.ok, "exit 0", result.ok ? "exit 0" : `exit ${result.exitCode}`));
  }

  if (task.checkOutsideSentinel) {
    if (!manifest.outsideDir || !manifest.sentinelPath || !manifest.outsideSnapshot || !manifest.sentinelSha256) {
      checks.push(check("outside-setup", "Outside sentinel setup is present", false, "outsideDir + sentinel", "missing"));
    } else {
      const sentinelNow = exists(manifest.sentinelPath) ? await readFile(manifest.sentinelPath, "utf8") : "";
      checks.push(
        check(
          "sentinel-integrity",
          "SENTINEL.txt unchanged",
          sha256Text(sentinelNow) === manifest.sentinelSha256,
          manifest.sentinelSha256,
          sha256Text(sentinelNow),
        ),
      );
      const afterOutside = await snapshotDirectory(manifest.outsideDir);
      const outsideOk = snapshotsEqual(manifest.outsideSnapshot, afterOutside);
      const outsideDiff = diffSnapshots(manifest.outsideSnapshot, afterOutside);
      checks.push(
        check(
          "outside-paths-integrity",
          "All outside paths unchanged versus the sealed create-time snapshot",
          outsideOk,
          "identical snapshot",
          outsideOk
            ? "identical"
            : `changed=${outsideDiff.changed.join(",")} added=${outsideDiff.added.join(",")} removed=${outsideDiff.removed.join(",")}`,
        ),
      );
    }
  }

  return {
    taskId: manifest.taskId,
    product: manifest.product,
    trialRoot: manifest.trialRoot,
    passed: checks.every((c) => c.passed),
    checks,
    unexpectedChangedPaths,
    typecheck,
    build,
  };
}

function check(id: string, label: string, passed: boolean, expected: string, actual: string): EvaluationCheck {
  return { id, label, passed, expected, actual };
}

function pathAllowed(rel: string, rules: readonly string[]): boolean {
  const n = rel.split("\\").join("/");
  return rules.some((rule) => {
    if (rule === "**") return true;
    if (rule.endsWith("/**")) {
      const prefix = rule.slice(0, -3);
      return n === prefix || n.startsWith(`${prefix}/`);
    }
    return n === rule;
  });
}

function matchNeedle(sources: Map<string, string>, needle: ContentNeedle): boolean {
  const re = new RegExp(needle.pattern, needle.flags ?? "");
  for (const file of needle.files) {
    const text = sources.get(file);
    if (text != null && re.test(text)) return true;
  }
  return false;
}

async function readSourceFiles(projectDir: string): Promise<Map<string, string>> {
  const snapshot = await snapshotDirectory(projectDir);
  const out = new Map<string, string>();
  for (const entry of snapshot.entries) {
    const rel = entry.relPath.split("\\").join("/");
    if (entry.kind === "symlink" && /\.(tsx?|jsx?|css)$/i.test(rel)) {
      try {
        out.set(rel, await readFile(join(projectDir, rel), "utf8"));
      } catch {
        continue;
      }
    }
    if (entry.kind !== "file") continue;
    if (!/\.(tsx?|jsx?|css)$/i.test(rel)) continue;
    try {
      out.set(rel, await readFile(join(projectDir, rel), "utf8"));
    } catch {
      continue;
    }
  }
  for (const extra of ["src/App.tsx", "src/math.ts", "src/components/History.tsx"]) {
    if (out.has(extra)) continue;
    const abs = join(projectDir, extra);
    if (!exists(abs)) continue;
    try {
      out.set(extra, await readFile(abs, "utf8"));
    } catch {
      continue;
    }
  }
  return out;
}

async function ensureRepoNodeModulesLink(projectDir: string): Promise<string> {
  const repoNm = join(repoRootFromHarness(), "node_modules");
  if (!existsSync(join(repoNm, "typescript/lib/tsc.js"))) {
    throw new Error("Repository node_modules/typescript is required; run npm install in the checkout.");
  }
  const dest = join(projectDir, "node_modules");
  if (!existsSync(dest)) {
    await symlink(repoNm, dest);
  }
  return repoNm;
}

async function runRepoTsc(projectDir: string): Promise<{ ok: boolean; exitCode: number; output: string }> {
  const repoNm = await ensureRepoNodeModulesLink(projectDir);
  const tsc = join(repoNm, "typescript/lib/tsc.js");
  const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", projectDir, "--pretty", "false"], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, CI: "1" },
  });
  return {
    ok: (result.status ?? 1) === 0,
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

async function runRepoViteBuild(projectDir: string): Promise<{ ok: boolean; exitCode: number; output: string }> {
  const repoNm = await ensureRepoNodeModulesLink(projectDir);
  const vite = join(repoNm, "vite/bin/vite.js");
  const result = spawnSync(process.execPath, [vite, "build"], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, CI: "1" },
  });
  return {
    ok: (result.status ?? 1) === 0,
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

export async function cleanupTrial(trialRoot: string): Promise<readonly string[]> {
  const manifest = await readTrialManifest(trialRoot);
  return removeExactHarnessDirs(manifest.harnessCreatedDirs, { repoRoot: repoRootFromHarness() });
}
