import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Committed CI/local replay snapshots (no node_modules). */
export function repoStressFixturesRoot(): string {
  return join(REPO_ROOT, "benchmarks", "fixtures", "stress");
}

function desktopStressBaseRoot(): string {
  return join(homedir(), "Desktop", "studiotest", "stress");
}

/**
 * Active stress corpus root: env override, then Desktop when present, else repo fixtures.
 * CI sets `BRYANTLABS_STRESS_FIXTURES_ROOT` or relies on `CI=1` to use committed snapshots.
 */
export function resolveStressBaseRoot(): string {
  const envRoot = process.env.BRYANTLABS_STRESS_FIXTURES_ROOT?.trim();
  if (envRoot) return envRoot;

  const repoFixtures = repoStressFixturesRoot();
  const desktop = desktopStressBaseRoot();
  const preferRepo =
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.env.BRYANTLABS_STRESS_USE_REPO_FIXTURES === "1";

  if (preferRepo && existsSync(join(repoFixtures, "replay-frozen"))) {
    return repoFixtures;
  }

  if (existsSync(join(desktop, "replay-frozen"))) {
    return desktop;
  }

  if (existsSync(join(repoFixtures, "replay-frozen"))) {
    return repoFixtures;
  }

  return desktop;
}

/** Base folder for all greenfield stress artifacts under Desktop/studiotest. */
export function defaultStressBaseRoot(): string {
  return desktopStressBaseRoot();
}

/** Live Gemini generation + verify output (overwritten each live run). */
export function defaultLiveStressRoot(): string {
  return join(defaultStressBaseRoot(), "live");
}

/** Frozen repair replay corpus — lock snapshots here; never overwritten by live runs. */
export function defaultReplayFrozenRoot(): string {
  return join(resolveStressBaseRoot(), "replay-frozen");
}

/**
 * @deprecated Legacy flat layout (`stress/<id>/`). Prefer {@link defaultLiveStressRoot}.
 * Used only for one-time migration / `--from-legacy` lock sources.
 * When repo fixtures exist, legacy snapshots live under `benchmarks/fixtures/stress/legacy/`.
 */
export function legacyStressOutputRoot(): string {
  const base = resolveStressBaseRoot();
  const repoLegacy = join(base, "legacy");
  if (existsSync(repoLegacy)) return repoLegacy;
  return base;
}

export function projectDir(root: string, projectId: string): string {
  return join(root, projectId);
}
