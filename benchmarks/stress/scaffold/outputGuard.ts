import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function repoRoot(): string {
  return REPO_ROOT;
}

export function committedLegacyCorpusRoot(): string {
  return realIfExists(resolve(REPO_ROOT, "benchmarks/fixtures/stress/legacy"));
}

export function committedReplayFrozenCorpusRoot(): string {
  return realIfExists(resolve(REPO_ROOT, "benchmarks/fixtures/stress/replay-frozen"));
}

export class ScaffoldOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldOutputError";
  }
}

function realIfExists(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

function isInsideOrEqual(candidate: string, parent: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function hasTraversalSegment(raw: string): boolean {
  return raw.split(/[/\\]/).includes("..");
}

/**
 * Resolve logical path, then realpath every existing ancestor so symlink
 * aliases cannot hide a target inside the repo or frozen corpora.
 */
export function canonicalizeOutputPath(raw: string): string {
  const abs = resolve(raw);
  const missing: string[] = [];
  let cursor = abs;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(basename(cursor));
    cursor = parent;
  }
  const realAncestor = realpathSync(cursor);
  return missing.length > 0 ? join(realAncestor, ...missing) : realAncestor;
}

function isBroadUnsafePath(canonical: string): boolean {
  const blocked = new Set(
    [
      "/",
      "/tmp",
      "/private/tmp",
      "/var",
      "/usr",
      "/etc",
      homedir(),
      tmpdir(),
      REPO_ROOT,
      join(REPO_ROOT, "benchmarks"),
      join(REPO_ROOT, "benchmarks/fixtures"),
      join(REPO_ROOT, "benchmarks/fixtures/stress"),
    ].map((path) => realIfExists(path)),
  );
  return blocked.has(canonical);
}

export interface ResolveScaffoldOutputOptions {
  readonly output: string | null | undefined;
  readonly overwrite?: boolean;
  readonly allowCorpusOutput?: boolean;
}

export function resolveScaffoldOutputPath(
  options: ResolveScaffoldOutputOptions,
): string {
  const raw = options.output?.trim() ?? "";
  if (!raw) {
    throw new ScaffoldOutputError("An explicit --output directory is required.");
  }
  if (hasTraversalSegment(raw)) {
    throw new ScaffoldOutputError(
      "Output path must not contain '..' traversal segments.",
    );
  }

  const canonical = canonicalizeOutputPath(raw);
  if (isBroadUnsafePath(canonical)) {
    throw new ScaffoldOutputError(
      `Refusing unsafe broad output path: ${canonical}`,
    );
  }

  const inRepo = isInsideOrEqual(canonical, realIfExists(REPO_ROOT));
  const inLegacy = isInsideOrEqual(canonical, committedLegacyCorpusRoot());
  const inFrozen = isInsideOrEqual(canonical, committedReplayFrozenCorpusRoot());
  if (inRepo && !(options.allowCorpusOutput && (inLegacy || inFrozen))) {
    throw new ScaffoldOutputError(
      inLegacy || inFrozen
        ? "Refusing output inside the committed legacy or replay-frozen stress corpus. A future replacement command must pass --allow-corpus-output to opt in."
        : `Refusing output inside the repository: ${canonical}`,
    );
  }

  if (existsSync(canonical) || existsSync(resolve(raw))) {
    const inspect = existsSync(canonical) ? canonical : resolve(raw);
    const stat = lstatSync(inspect);
    const targetStat = stat.isSymbolicLink() ? statSync(inspect) : stat;
    if (!targetStat.isDirectory()) {
      throw new ScaffoldOutputError(`Output path is not a directory: ${canonical}`);
    }
    const entries = readdirSync(inspect);
    if (entries.length > 0 && !options.overwrite) {
      throw new ScaffoldOutputError(
        `Output directory is not empty: ${canonical}. Pass --overwrite to replace generated files in this directory only.`,
      );
    }
  }

  return canonical;
}
