import { mkdtemp, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  copyFixtureTree,
  exists,
  overlayFixtureRoot,
  sha256Text,
  sharedFixtureRoot,
  snapshotDirectory,
} from "./fs.ts";
import { getPilotTask } from "./tasks.ts";
import type { CreateTrialResult, PilotProduct, PilotTaskId, TrialManifest } from "./types.ts";
import { MANIFEST_VERSION, PILOT_PRODUCTS, PILOT_TASK_IDS } from "./types.ts";

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export function parseProduct(value: string): PilotProduct {
  if ((PILOT_PRODUCTS as readonly string[]).includes(value)) return value as PilotProduct;
  throw new Error(`Unknown product: ${value}. Expected ${PILOT_PRODUCTS.join(" or ")}`);
}

export function parseTaskId(value: string): PilotTaskId {
  const id = value.toUpperCase();
  if ((PILOT_TASK_IDS as readonly string[]).includes(id)) return id as PilotTaskId;
  throw new Error(`Unknown task: ${value}. Expected ${PILOT_TASK_IDS.join(", ")}`);
}

export function trialDirIdentity(trialRoot: string): { taskId: PilotTaskId; product: PilotProduct } {
  const match = /^bl-pilot-(G1|R1|D1|U1|F1)-(studio|reference)-/.exec(basename(trialRoot));
  if (!match) {
    throw new ManifestError(`Trial directory name is not a harness identity: ${basename(trialRoot)}`);
  }
  return { taskId: match[1] as PilotTaskId, product: match[2] as PilotProduct };
}

export function manifestIntegrity(manifest: Omit<TrialManifest, "integrity">): string {
  return sha256Text(JSON.stringify(manifest));
}

export async function createPilotTrial(options: {
  readonly taskId: string;
  readonly product: string;
  readonly tmpRoot?: string;
}): Promise<CreateTrialResult> {
  const taskId = parseTaskId(options.taskId);
  const product = parseProduct(options.product);
  const task = getPilotTask(taskId);
  const baseTmp = options.tmpRoot ?? tmpdir();
  const trialRoot = await mkdtemp(join(baseTmp, `bl-pilot-${taskId}-${product}-`));
  const projectDir = join(trialRoot, "project");
  const harnessCreatedDirs = [trialRoot];

  await copyFixtureTree(sharedFixtureRoot(), projectDir);
  if (task.overlay) {
    const overlay = overlayFixtureRoot(task.overlay);
    if (exists(overlay)) {
      await copyFixtureTree(overlay, projectDir, { merge: true });
    }
  }

  let outsideDir: string | null = null;
  let sentinelPath: string | null = null;
  let sentinelSha256: string | null = null;
  let openPath = projectDir;

  if (task.checkOutsideSentinel) {
    outsideDir = await mkdtemp(join(baseTmp, `bl-pilot-${taskId}-outside-`));
    harnessCreatedDirs.push(outsideDir);
    const sentinelBody = "untouched\n";
    sentinelPath = join(outsideDir, "SENTINEL.txt");
    await writeFile(sentinelPath, sentinelBody, "utf8");
    sentinelSha256 = sha256Text(sentinelBody);
    await rename(join(projectDir, "src"), join(outsideDir, "src"));
    await symlink(join(outsideDir, "src"), join(projectDir, "src"));
    const openLink = join(trialRoot, "open");
    await symlink(projectDir, openLink);
    openPath = openLink;
  }

  const unsigned: Omit<TrialManifest, "integrity"> = {
    version: MANIFEST_VERSION,
    taskId,
    product,
    createdAt: new Date().toISOString(),
    trialRoot,
    projectDir,
    openPath,
    outsideDir,
    sentinelPath,
    sentinelSha256,
    harnessCreatedDirs,
    projectSnapshot: await snapshotDirectory(projectDir),
    outsideSnapshot: outsideDir ? await snapshotDirectory(outsideDir) : null,
  };
  const manifest: TrialManifest = {
    ...unsigned,
    integrity: manifestIntegrity(unsigned),
  };
  await writeFile(join(trialRoot, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, prompt: task.canonicalPrompt };
}
