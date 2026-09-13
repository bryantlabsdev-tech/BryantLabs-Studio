import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as net from "node:net";

export const TERM_GRACE_MS = 400;
export const PORT_RELEASE_MS = 1_500;

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

export function signalPid(pid: number, signal: NodeJS.Signals): void {
  if (pid === process.pid || pid <= 1) return;
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone (ESRCH) or not permitted — never widen the target set.
  }
}

export function signalProcessTree(
  pids: Iterable<number>,
  signal: NodeJS.Signals,
): void {
  for (const pid of pids) signalPid(pid, signal);
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

export function expandTrackedPids(pids: Iterable<number>): Set<number> {
  const collected = new Set<number>();
  for (const root of pids) {
    if (!Number.isInteger(root) || root <= 1 || root === process.pid) continue;
    collected.add(root);
    for (const pid of collectProcessTree(root)) collected.add(pid);
  }
  collected.delete(process.pid);
  return collected;
}

function taskkillWindowsTree(pid: number): void {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      timeout: 2_000,
      stdio: "ignore",
    });
  } catch {
    signalPid(pid, "SIGKILL");
  }
}

/** SIGTERM tracked PIDs (and current descendants), then SIGKILL leftovers. Idempotent. */
export async function terminateTrackedPids(
  pids: Iterable<number>,
  opts?: TerminateProcessTreeOptions,
): Promise<void> {
  const grace = opts?.termGraceMs ?? TERM_GRACE_MS;
  const collected = expandTrackedPids(pids);
  if (collected.size === 0) return;

  if (process.platform === "win32") {
    for (const pid of collected) taskkillWindowsTree(pid);
    await delay(Math.min(grace, 150));
    return;
  }

  for (const pid of collected) signalPid(pid, "SIGTERM");
  const termDeadline = Date.now() + grace;
  while (Date.now() < termDeadline) {
    if (![...collected].some((pid) => isPidAlive(pid))) return;
    await delay(20);
  }

  for (const pid of expandTrackedPids(collected)) {
    collected.add(pid);
  }
  for (const pid of collected) {
    if (isPidAlive(pid)) signalPid(pid, "SIGKILL");
  }
  const killDeadline = Date.now() + Math.min(grace, 150);
  while (Date.now() < killDeadline) {
    if (![...collected].some((pid) => isPidAlive(pid))) return;
    await delay(20);
  }
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

export function listListeningPidsOnPort(port: number): number[] {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return [];
  if (process.platform === "win32") return listListeningPidsOnPortWindows(port);
  const fromLsof = listListeningPidsFromLsof(port);
  if (fromLsof.length > 0) return fromLsof;
  return listListeningPidsFromSs(port);
}

function listListeningPidsFromLsof(port: number): number[] {
  try {
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", timeout: 2_000 },
    );
    return parsePidList(out);
  } catch {
    return [];
  }
}

function listListeningPidsFromSs(port: number): number[] {
  try {
    const out = execFileSync("ss", ["-lptn", `sport = :${port}`], {
      encoding: "utf8",
      timeout: 2_000,
    });
    const pids = new Set<number>();
    for (const match of out.matchAll(/pid=(\d+)/g)) {
      const pid = Number(match[1]);
      if (Number.isInteger(pid) && pid > 1) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function listListeningPidsOnPortWindows(port: number): number[] {
  try {
    const out = execFileSync("netstat", ["-ano", "-p", "TCP"], {
      encoding: "utf8",
      timeout: 2_000,
    });
    const needle = `:${port}`;
    const pids = new Set<number>();
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line) || !line.includes(needle)) continue;
      const tokens = line.trim().split(/\s+/);
      const pid = Number(tokens[tokens.length - 1]);
      if (Number.isInteger(pid) && pid > 1) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

export function isTcpPortInUse(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (err: NodeJS.ErrnoException) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, host);
  });
}

/**
 * Wait until `port` is free, or until the remaining listener is outside the
 * tracked PID set. Never kills an unproven (untracked) listener.
 */
export async function waitForTrackedPortRelease(
  port: number,
  trackedPids: Iterable<number>,
  timeoutMs: number = PORT_RELEASE_MS,
): Promise<void> {
  if (!Number.isInteger(port) || port <= 0) return;
  const tracked = new Set<number>();
  for (const pid of trackedPids) {
    if (Number.isInteger(pid) && pid > 1 && pid !== process.pid) tracked.add(pid);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isTcpPortInUse(port))) return;
    const listeners = listListeningPidsOnPort(port);
    if (listeners.length > 0) {
      const owned = listeners.filter((pid) => tracked.has(pid));
      if (owned.length === 0) return;
      await terminateTrackedPids(owned, { termGraceMs: 50 });
      continue;
    }
    await delay(40);
  }
}
