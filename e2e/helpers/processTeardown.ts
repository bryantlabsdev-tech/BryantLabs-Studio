import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const CLOSE_GRACE_MS = 750;
export const CLOSE_SETTLE_MS = 400;
export const TERM_GRACE_MS = 400;

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function listDirectChildPids(pid: number): number[] {
  if (!Number.isInteger(pid) || pid <= 1) return [];
  const found = new Set<number>();
  for (const child of listChildrenFromPs(pid)) found.add(child);
  for (const child of listChildrenFromPgrep(pid)) found.add(child);
  for (const child of listChildrenFromProc(pid)) found.add(child);
  found.delete(pid);
  found.delete(process.pid);
  return [...found];
}

function listChildrenFromPs(parentPid: number): number[] {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,ppid="], {
      encoding: "utf8",
      timeout: 2_000,
    });
    const children: number[] = [];
    for (const line of out.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (!match) continue;
      const childPid = Number(match[1]);
      const ppid = Number(match[2]);
      if (ppid === parentPid && childPid > 1) children.push(childPid);
    }
    return children;
  } catch {
    return [];
  }
}

function listChildrenFromPgrep(parentPid: number): number[] {
  try {
    const out = execFileSync("pgrep", ["-P", String(parentPid)], {
      encoding: "utf8",
      timeout: 2_000,
    });
    return parsePidList(out);
  } catch {
    return [];
  }
}

function listChildrenFromProc(parentPid: number): number[] {
  try {
    const text = readFileSync(`/proc/${parentPid}/task/${parentPid}/children`, "utf8");
    return parsePidList(text);
  } catch {
    return [];
  }
}

function parsePidList(text: string): number[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => Number(token))
    .filter((pid) => Number.isInteger(pid) && pid > 1);
}

/** Root PID plus descendants. Descendants are listed first so they are signaled first. */
export function collectProcessTree(rootPid: number): number[] {
  if (!Number.isInteger(rootPid) || rootPid <= 1) return [];
  const seen = new Set<number>();
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (seen.has(pid) || pid === process.pid || pid <= 1) continue;
    seen.add(pid);
    if (!isPidAlive(pid) && pid !== rootPid) continue;
    for (const child of listDirectChildPids(pid)) {
      if (!seen.has(child) && child !== process.pid) queue.push(child);
    }
  }
  if (!isPidAlive(rootPid) && seen.size === 1) return [];
  const pids = [...seen];
  pids.reverse();
  return pids;
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  if (pid === process.pid || pid <= 1) return;
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone (ESRCH) or not permitted — never widen the target set.
  }
}

export async function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await delay(20);
  }
  return !isPidAlive(pid);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TerminateProcessTreeOptions {
  readonly termGraceMs?: number;
}

function expandTrackedPids(pids: Iterable<number>): Set<number> {
  const collected = new Set<number>();
  for (const root of pids) {
    if (!Number.isInteger(root) || root <= 1 || root === process.pid) continue;
    collected.add(root);
    for (const pid of collectProcessTree(root)) collected.add(pid);
  }
  collected.delete(process.pid);
  return collected;
}

/** SIGTERM tracked PIDs (and current descendants), then SIGKILL leftovers. Idempotent. */
export async function terminateTrackedPids(
  pids: Iterable<number>,
  opts?: TerminateProcessTreeOptions,
): Promise<void> {
  const grace = opts?.termGraceMs ?? TERM_GRACE_MS;
  const collected = expandTrackedPids(pids);
  if (collected.size === 0) return;

  for (const pid of collected) signalPid(pid, "SIGTERM");
  await delay(grace);

  for (const pid of expandTrackedPids(collected)) {
    collected.add(pid);
  }
  for (const pid of collected) {
    if (isPidAlive(pid)) signalPid(pid, "SIGKILL");
  }
  await delay(Math.min(grace, 150));
}

/**
 * SIGTERM the tracked tree, then SIGKILL leftovers after a short grace period.
 * Idempotent: already-exited PIDs are ignored.
 */
export async function terminateProcessTree(
  rootPid: number | null | undefined,
  opts?: TerminateProcessTreeOptions,
): Promise<void> {
  if (rootPid == null || !Number.isInteger(rootPid) || rootPid <= 1) return;
  await terminateTrackedPids([rootPid], opts);
}

const closedApps = new WeakSet<object>();
const trackedRootPids = new Set<number>();

export function trackRootPid(pid: number | undefined): void {
  if (pid != null && Number.isInteger(pid) && pid > 1 && pid !== process.pid) {
    trackedRootPids.add(pid);
  }
}

export function untrackRootPid(pid: number | undefined): void {
  if (pid != null) trackedRootPids.delete(pid);
}

export function beginClose(
  close: () => Promise<void>,
): Promise<boolean> {
  return Promise.resolve()
    .then(() => close())
    .then(() => true)
    .catch(() => false);
}

export async function closeWithGrace(
  close: () => Promise<void>,
  graceMs: number = CLOSE_GRACE_MS,
): Promise<boolean> {
  return Promise.race([beginClose(close), delay(graceMs).then(() => false)]);
}

async function settleClose(
  pending: Promise<boolean>,
  settleMs: number,
): Promise<boolean> {
  return Promise.race([pending, delay(settleMs).then(() => false)]);
}

export interface StudioAppLike {
  close(): Promise<void>;
  process(): { pid?: number };
}

function safePid(app: StudioAppLike): number | undefined {
  try {
    const pid = app.process()?.pid;
    return typeof pid === "number" && pid > 1 ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Close a Playwright Electron app, then terminate its process tree
 * (including npm/vite preview descendants, even if reparented). Safe to call repeatedly.
 */
export async function teardownStudioApp(
  app: StudioAppLike | null | undefined,
  opts?: { closeGraceMs?: number; closeSettleMs?: number; termGraceMs?: number },
): Promise<void> {
  const pid = app ? safePid(app) : undefined;
  if (pid) trackRootPid(pid);
  const snapshot = pid ? [...expandTrackedPids([pid])] : [];
  // Promote current descendants so a later reparent (Linux init) still dies.
  for (const child of snapshot) trackRootPid(child);

  const roots = new Set<number>(snapshot);
  if (pid) roots.add(pid);
  for (const tracked of trackedRootPids) roots.add(tracked);

  if (app != null && !closedApps.has(app)) {
    closedApps.add(app);
    const closePromise = beginClose(() => app.close());
    const graceful = await Promise.race([
      closePromise,
      delay(opts?.closeGraceMs ?? CLOSE_GRACE_MS).then(() => false),
    ]);

    if (!graceful) {
      await terminateTrackedPids(roots, { termGraceMs: opts?.termGraceMs });
    }

    await settleClose(closePromise, opts?.closeSettleMs ?? CLOSE_SETTLE_MS);
  }

  await terminateTrackedPids(roots, { termGraceMs: opts?.termGraceMs });
  for (const root of roots) untrackRootPid(root);
}

export async function teardownTrackedStudioProcesses(
  opts?: TerminateProcessTreeOptions,
): Promise<void> {
  if (trackedRootPids.size === 0) return;
  const roots = [...trackedRootPids];
  await terminateTrackedPids(roots, opts);
  for (const root of roots) untrackRootPid(root);
}
