import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { STRESS_PROMPTS_FAST_IDS } from "./promptSelection";
import { STRESS_PROMPTS } from "./prompts";
import {
  applyDeterministicRepairsOnProject,
  type ProjectRepairResult,
} from "./applyProjectRepairs";
import { copyProjectTree } from "./replaySnapshot";
import {
  defaultLiveStressRoot,
  defaultReplayFrozenRoot,
  defaultStressBaseRoot,
  legacyStressOutputRoot,
} from "./stressPaths";
import { runShellCommand } from "./verifyProject";

/** Frozen replay corpus — aligned with fast live suite (5 prompts). */
export const REPLAY_FROZEN_PROJECT_IDS = [...STRESS_PROMPTS_FAST_IDS] as const;

export type ReplayFrozenProjectId = (typeof REPLAY_FROZEN_PROJECT_IDS)[number];

/** @deprecated Use {@link REPLAY_FROZEN_PROJECT_IDS}. Kept for import compatibility. */
export const FAILED_STRESS_PROJECT_IDS = REPLAY_FROZEN_PROJECT_IDS;

export type FailedStressProjectId = ReplayFrozenProjectId;

export interface RepairReplayProjectResult {
  readonly id: string;
  readonly root: string;
  readonly typecheckOk: boolean;
  readonly buildOk: boolean;
  readonly deterministicPasses: number;
  readonly repairAttempts: number;
  readonly primaryError: string | null;
}

export interface RepairReplayReport {
  readonly corpusRoot: string;
  readonly results: readonly RepairReplayProjectResult[];
  readonly typecheckPassCount: number;
  readonly buildPassCount: number;
  readonly targetMet: boolean;
  readonly passTarget: number;
}

export function defaultStressOutputRoot(): string {
  return defaultLiveStressRoot();
}

export function defaultReplayCorpusRoot(): string {
  return defaultReplayFrozenRoot();
}

export async function replayRepairsOnProject(
  root: string,
  id: string,
  maxPasses = 24,
): Promise<RepairReplayProjectResult> {
  const install = await runShellCommand("npm install", root, 600_000);
  if (install.exitCode !== 0 || install.timedOut) {
    return {
      id,
      root,
      typecheckOk: false,
      buildOk: false,
      deterministicPasses: 0,
      repairAttempts: 0,
      primaryError:
        `${install.stdout}\n${install.stderr}`.split("\n").find((l) => /error/i.test(l)) ??
        "npm install failed",
    };
  }

  const repair: ProjectRepairResult = await applyDeterministicRepairsOnProject(root, maxPasses);

  let buildOk = false;
  let primaryError: string | null = null;

  if (repair.typecheckOk) {
    const build = await runShellCommand("npm run build", root);
    buildOk = build.exitCode === 0 && !build.timedOut;
    if (!buildOk) {
      primaryError =
        `${build.stdout}\n${build.stderr}`.split("\n").find((l) => /error/i.test(l)) ??
        "build failed";
    }
  } else {
    const combined = repair.stderr;
    primaryError =
      combined.split("\n").find((l) => /error TS\d+/.test(l)) ??
      combined.split("\n").find((l) => /error/i.test(l) && !/^npm warn/.test(l)) ??
      combined.slice(0, 300);
  }

  return {
    id,
    root,
    typecheckOk: repair.typecheckOk,
    buildOk,
    deterministicPasses: repair.deterministicPasses,
    repairAttempts: repair.attempts.length,
    primaryError,
  };
}

function resolvePassTarget(
  projectCount: number,
  explicit?: number,
): number {
  if (explicit !== undefined) return explicit;
  if (process.env.BRYANTLABS_STRESS_REPLAY_STRICT === "1") {
    return projectCount;
  }
  return Math.max(1, Math.ceil(projectCount * 0.8));
}

export async function replayRepairsOnProjects(
  projectIds: readonly string[],
  options?: {
    readonly stressRoot?: string;
    readonly maxPasses?: number;
    readonly passTarget?: number;
  },
): Promise<RepairReplayReport> {
  const stressRoot = options?.stressRoot ?? defaultReplayCorpusRoot();
  const maxPasses = options?.maxPasses ?? 24;
  const passTarget = resolvePassTarget(projectIds.length, options?.passTarget);

  const results: RepairReplayProjectResult[] = [];
  const tempParent = await mkdtemp(join(tmpdir(), "stress-replay-"));
  try {
    for (const id of projectIds) {
      const frozenRoot = join(stressRoot, id);
      const workspaceRoot = join(tempParent, id);
      await copyProjectTree(frozenRoot, workspaceRoot);
      results.push(await replayRepairsOnProject(workspaceRoot, id, maxPasses));
    }
  } finally {
    await rm(tempParent, { recursive: true, force: true });
  }

  const typecheckPassCount = results.filter((r) => r.typecheckOk).length;
  const buildPassCount = results.filter((r) => r.buildOk).length;

  return {
    corpusRoot: stressRoot,
    results,
    typecheckPassCount,
    buildPassCount,
    passTarget,
    targetMet: typecheckPassCount >= passTarget && buildPassCount >= passTarget,
  };
}

export async function replayRepairsOnFailedProjects(options?: {
  readonly stressRoot?: string;
  readonly projectIds?: readonly ReplayFrozenProjectId[];
  readonly maxPasses?: number;
  readonly targetPassCount?: number;
}): Promise<RepairReplayReport> {
  const projectIds = options?.projectIds ?? REPLAY_FROZEN_PROJECT_IDS;
  const passTarget = resolvePassTarget(
    projectIds.length,
    options?.targetPassCount,
  );

  return replayRepairsOnProjects(projectIds, {
    ...(options?.stressRoot !== undefined ? { stressRoot: options.stressRoot } : {}),
    ...(options?.maxPasses !== undefined ? { maxPasses: options.maxPasses } : {}),
    passTarget,
  });
}

/** Replay the full 10-project legacy flat corpus under Desktop/studiotest/stress. */
export async function replayRepairsOnLegacySuite(options?: {
  readonly maxPasses?: number;
  readonly targetPassCount?: number;
}): Promise<RepairReplayReport> {
  const projectIds = STRESS_PROMPTS.map((p) => p.id);
  return replayRepairsOnProjects(projectIds, {
    stressRoot: legacyStressOutputRoot(),
    passTarget: resolvePassTarget(projectIds.length, options?.targetPassCount),
    ...(options?.maxPasses !== undefined ? { maxPasses: options.maxPasses } : {}),
  });
}

export function formatRepairReplayReport(report: RepairReplayReport): string {
  const lines = [
    "# Repair-only replay report",
    "",
    `- **Corpus:** \`${report.corpusRoot}\` (frozen — not live output)`,
    `- Typecheck pass: ${report.typecheckPassCount}/${report.results.length}`,
    `- Build pass: ${report.buildPassCount}/${report.results.length}`,
    `- Target met (>=${report.passTarget}): ${report.targetMet ? "yes" : "no"}`,
    "",
    "| Project | Typecheck | Build | Passes | Primary error |",
    "|---------|-----------|-------|--------|---------------|",
  ];

  for (const result of report.results) {
    const err = (result.primaryError ?? "—").replace(/\|/g, "\\|").slice(0, 80);
    lines.push(
      `| ${result.id} | ${result.typecheckOk ? "PASS" : "FAIL"} | ${result.buildOk ? "PASS" : "FAIL"} | ${result.deterministicPasses} | ${err} |`,
    );
  }

  lines.push("");
  lines.push(
    "_Replay measures repair convergence on locked snapshots. Live stress writes to `stress/live/` — run `npm run greenfield:stress:lock-replay` after a live run to refresh frozen corpus._",
  );

  return `${lines.join("\n")}\n`;
}

/** @deprecated Use {@link defaultReplayCorpusRoot} */
export function defaultStressBasePath(): string {
  return defaultStressBaseRoot();
}

/** @deprecated Use {@link legacyStressOutputRoot} from stressPaths */
export function legacyFlatStressRoot(): string {
  return legacyStressOutputRoot();
}

/** Convenience for scripts that need homedir-based paths in tests */
export function stressHomeRoot(): string {
  return join(homedir(), "Desktop", "studiotest", "stress");
}
