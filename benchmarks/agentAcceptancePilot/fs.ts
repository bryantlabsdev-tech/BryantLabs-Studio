import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  unlink,
  rmdir,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { DirectorySnapshot, FileSnapshotEntry } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export function harnessRoot(): string {
  return HERE;
}

export function fixturesRoot(): string {
  return join(HERE, "fixtures");
}

export function sharedFixtureRoot(): string {
  return join(fixturesRoot(), "shared");
}

export function overlayFixtureRoot(overlay: string): string {
  return join(fixturesRoot(), overlay);
}

export function repoRootFromHarness(): string {
  return join(HERE, "..", "..");
}

const SKIP_NAMES = new Set([
  "node_modules",
  "dist",
  "dist-electron",
  ".bryantlabs",
  ".git",
  "test-results",
  "playwright-report",
  "blob-report",
  "coverage",
]);

export function shouldSkipCopyEntry(name: string, relPath: string): boolean {
  if (SKIP_NAMES.has(name)) return true;
  if (name === "credentials.json" || name === "provider-settings.json" || name === ".env" || name === ".npmrc") {
    return true;
  }
  if (name.endsWith(".local") || name.startsWith(".env.")) return true;
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return true;
  const parts = relPath.split("\\").join("/").split("/").filter(Boolean);
  return parts.some((part) => SKIP_NAMES.has(part));
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function copyFixtureTree(
  source: string,
  dest: string,
  options: { readonly merge?: boolean } = {},
): Promise<void> {
  if (!options.merge) {
    await rm(dest, { recursive: true, force: true });
  }
  await mkdir(dest, { recursive: true });
  await walkCopy(source, dest, "");
}

async function walkCopy(sourceRoot: string, destRoot: string, rel: string): Promise<void> {
  const absSrc = rel ? join(sourceRoot, rel) : sourceRoot;
  const entries = await readdir(absSrc, { withFileTypes: true });
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (shouldSkipCopyEntry(entry.name, childRel)) continue;
    const from = join(sourceRoot, childRel);
    const to = join(destRoot, childRel);
    if (entry.isSymbolicLink()) {
      await cp(from, to);
      continue;
    }
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await walkCopy(sourceRoot, destRoot, childRel);
      continue;
    }
    await cp(from, to);
  }
}

export async function snapshotDirectory(root: string): Promise<DirectorySnapshot> {
  const rootStat = await lstat(root);
  const entries: FileSnapshotEntry[] = [];
  await walkSnapshot(root, "", entries);
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return {
    rootKind: rootStat.isSymbolicLink() ? "symlink" : "dir",
    entries,
  };
}

async function walkSnapshot(root: string, rel: string, out: FileSnapshotEntry[]): Promise<void> {
  const abs = rel ? join(root, rel) : root;
  const entries = await readdir(abs, { withFileTypes: true });
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (shouldSkipCopyEntry(entry.name, childRel)) continue;
    const childAbs = join(root, childRel);
    const stat = await lstat(childAbs);
    if (stat.isSymbolicLink()) {
      out.push({
        relPath: childRel,
        kind: "symlink",
        linkTarget: await readlink(childAbs),
      });
      continue;
    }
    if (stat.isDirectory()) {
      out.push({ relPath: childRel, kind: "dir" });
      await walkSnapshot(root, childRel, out);
      continue;
    }
    out.push({
      relPath: childRel,
      kind: "file",
      sha256: sha256Buffer(await readFile(childAbs)),
    });
  }
}

export function diffSnapshots(
  before: DirectorySnapshot,
  after: DirectorySnapshot,
): { readonly changed: readonly string[]; readonly added: readonly string[]; readonly removed: readonly string[] } {
  const beforeMap = new Map(before.entries.map((e) => [e.relPath, e]));
  const afterMap = new Map(after.entries.map((e) => [e.relPath, e]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const key of afterMap.keys()) {
    if (!beforeMap.has(key)) added.push(key);
  }
  for (const key of beforeMap.keys()) {
    if (!afterMap.has(key)) removed.push(key);
  }
  for (const [key, prev] of beforeMap) {
    const next = afterMap.get(key);
    if (!next) continue;
    if (fingerprint(prev) !== fingerprint(next)) changed.push(key);
  }
  added.sort();
  removed.sort();
  changed.sort();
  return { changed, added, removed };
}

function fingerprint(entry: FileSnapshotEntry): string {
  return [entry.kind, entry.sha256 ?? "", entry.linkTarget ?? ""].join("|");
}

export function snapshotsEqual(a: DirectorySnapshot, b: DirectorySnapshot): boolean {
  const diff = diffSnapshots(a, b);
  return diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0;
}

export function isInside(abs: string, root: string): boolean {
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export class CleanupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanupError";
  }
}

export async function removeExactHarnessDirs(
  dirs: readonly string[],
  options: { readonly repoRoot: string },
): Promise<readonly string[]> {
  const tmpReal = await realpath(tmpdir());
  const homeReal = await realpath(homedir());
  const repoReal = await realpath(options.repoRoot);
  const allow = new Set(dirs);
  const removed: string[] = [];
  for (const dir of dirs) {
    await assertSafeHarnessDir(dir, allow, tmpReal, homeReal, repoReal);
    await removeNoFollow(dir);
    removed.push(dir);
  }
  return removed;
}

async function assertSafeHarnessDir(
  dir: string,
  allow: Set<string>,
  tmpReal: string,
  homeReal: string,
  repoReal: string,
): Promise<void> {
  if (!allow.has(dir)) {
    throw new CleanupError(`Refusing to remove path not created by this trial: ${dir}`);
  }
  if (!isAbsolute(dir)) {
    throw new CleanupError(`Refusing relative cleanup path: ${dir}`);
  }
  let stat;
  try {
    stat = await lstat(dir);
  } catch {
    throw new CleanupError(`Refusing to remove unresolved path: ${dir}`);
  }
  if (stat.isSymbolicLink()) {
    if (isInside(dir, tmpReal) || dir.startsWith(tmpReal)) return;
    const parent = dirname(dir);
    try {
      const parentReal = await realpath(parent);
      if (!isInside(parentReal, tmpReal) && parentReal !== tmpReal) {
        throw new CleanupError(`Refusing to unlink symlink outside tmpdir: ${dir}`);
      }
    } catch (error) {
      if (error instanceof CleanupError) throw error;
      throw new CleanupError(`Refusing to unlink symlink with unresolved parent: ${dir}`);
    }
    return;
  }
  if (!stat.isDirectory()) {
    throw new CleanupError(`Refusing to remove non-directory: ${dir}`);
  }
  const resolved = await realpath(dir);
  if (resolved === "/" || resolved === homeReal || resolved === repoReal || resolved === tmpReal) {
    throw new CleanupError(`Refusing to remove protected path: ${resolved}`);
  }
  if (isInside(repoReal, resolved) && resolved !== repoReal) {
    // deleting a parent of the repo
    throw new CleanupError(`Refusing to remove a directory that contains the repository: ${resolved}`);
  }
  if (isInside(resolved, repoReal)) {
    throw new CleanupError(`Refusing to remove a path inside the repository: ${resolved}`);
  }
  if (isInside(resolved, homeReal) && !isInside(resolved, tmpReal) && resolved !== tmpReal) {
    const tmpIsInHome = isInside(tmpReal, homeReal);
    if (!tmpIsInHome || !isInside(resolved, tmpReal)) {
      throw new CleanupError(`Refusing to remove a home-directory path outside tmpdir: ${resolved}`);
    }
  }
  if (!isInside(resolved, tmpReal) && resolved !== tmpReal) {
    throw new CleanupError(`Refusing to remove path outside tmpdir: ${resolved}`);
  }
}

async function removeNoFollow(abs: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(abs);
  } catch {
    return;
  }
  if (stat.isSymbolicLink() || stat.isFile()) {
    await unlink(abs);
    return;
  }
  if (!stat.isDirectory()) {
    await unlink(abs);
    return;
  }
  const entries = await readdir(abs, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(abs, entry.name);
    if (entry.isSymbolicLink() || entry.isFile()) {
      await unlink(child);
      continue;
    }
    if (entry.isDirectory()) {
      await removeNoFollow(child);
    }
  }
  await rmdir(abs);
}

export function exists(path: string): boolean {
  return existsSync(path);
}
