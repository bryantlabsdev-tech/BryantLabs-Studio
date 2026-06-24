#!/usr/bin/env node
/**
 * Copy Desktop stress snapshots into committed CI fixtures (excludes node_modules/dist).
 *
 *   npm run greenfield:stress:sync-fixtures
 *   npm run greenfield:stress:sync-fixtures -- --from ~/Desktop/studiotest/stress
 */
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { REPLAY_FROZEN_PROJECT_IDS } from "../benchmarks/stress/repairReplay.ts";
import { STRESS_PROMPTS } from "../benchmarks/stress/prompts.ts";
import {
  defaultStressBaseRoot,
  repoStressFixturesRoot,
} from "../benchmarks/stress/stressPaths.ts";

const SKIP = new Set(["node_modules", "dist", ".git"]);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(source, dest) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  async function walk(rel) {
    const absSrc = join(source, rel);
    const entries = await readdir(absSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const from = join(source, childRel);
      const to = join(dest, childRel);
      if (entry.isDirectory()) {
        await mkdir(to, { recursive: true });
        await walk(childRel);
        continue;
      }
      await cp(from, to);
    }
  }

  await walk("");
}

function parseFrom(argv) {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--from") return argv[++i] ?? defaultStressBaseRoot();
  }
  return defaultStressBaseRoot();
}

const sourceRoot = parseFrom(process.argv);
const destRoot = repoStressFixturesRoot();
const frozenDest = join(destRoot, "replay-frozen");
const legacyDest = join(destRoot, "legacy");

await mkdir(frozenDest, { recursive: true });
await mkdir(legacyDest, { recursive: true });

const frozenLocked = [];
const legacyLocked = [];

for (const id of REPLAY_FROZEN_PROJECT_IDS) {
  const src = join(sourceRoot, "replay-frozen", id);
  if (!(await exists(join(src, "package.json")))) continue;
  await copyTree(src, join(frozenDest, id));
  frozenLocked.push(id);
}

for (const { id } of STRESS_PROMPTS) {
  const src = join(sourceRoot, id);
  if (!(await exists(join(src, "package.json")))) continue;
  await copyTree(src, join(legacyDest, id));
  legacyLocked.push(id);
}

console.log(`Synced stress fixtures into ${destRoot}`);
console.log(`  Frozen (${frozenLocked.length}): ${frozenLocked.join(", ") || "—"}`);
console.log(`  Legacy (${legacyLocked.length}): ${legacyLocked.join(", ") || "—"}`);

if (frozenLocked.length === 0) {
  console.error("\nNo frozen projects copied. Lock replay first or pass --from.");
  process.exitCode = 1;
}
