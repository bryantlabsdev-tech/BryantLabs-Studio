#!/usr/bin/env node
/**
 * Lock live stress project folders into the frozen replay corpus.
 *
 *   npm run greenfield:stress:lock-replay
 *   npm run greenfield:stress:lock-replay -- --from ~/Desktop/studiotest/stress/live
 *   npm run greenfield:stress:lock-replay -- --from-legacy
 */
import {
  lockReplaySnapshot,
  resolveLockSourceRoot,
} from "../benchmarks/stress/replaySnapshot.ts";
import { REPLAY_FROZEN_PROJECT_IDS } from "../benchmarks/stress/repairReplay.ts";
import {
  defaultLiveStressRoot,
  defaultReplayFrozenRoot,
  legacyStressOutputRoot,
} from "../benchmarks/stress/stressPaths.ts";

function parseArgs(argv) {
  const out = {
    from: null,
    fromLegacy: false,
    frozen: defaultReplayFrozenRoot(),
    ids: [...REPLAY_FROZEN_PROJECT_IDS],
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") out.from = argv[++i] ?? null;
    else if (arg === "--from-legacy") out.fromLegacy = true;
    else if (arg === "--frozen") out.frozen = argv[++i] ?? out.frozen;
    else if (arg === "--ids") {
      const raw = argv[++i] ?? "";
      out.ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const sourceRoot = args.fromLegacy
  ? legacyStressOutputRoot()
  : (args.from ?? (await resolveLockSourceRoot()).root);

const result = await lockReplaySnapshot({
  projectIds: args.ids,
  sourceRoot,
  frozenRoot: args.frozen,
});

console.log(`Locked ${result.locked.length} project(s) into frozen replay corpus.`);
console.log(`  Source:  ${result.sourceRoot}`);
console.log(`  Frozen:  ${result.frozenRoot}`);
if (result.locked.length) console.log(`  Locked:  ${result.locked.join(", ")}`);
if (result.skipped.length) console.log(`  Skipped: ${result.skipped.join(", ")}`);
if (result.missing.length) console.log(`  Missing: ${result.missing.join(", ")}`);
console.log("");
console.log("Run replay: npm run greenfield:stress:replay");

if (result.locked.length === 0) {
  console.error(
    `\nNo projects locked. Run live stress first (writes to ${defaultLiveStressRoot()}) or pass --from-legacy.`,
  );
  process.exitCode = 1;
}
