import * as fsSync from "node:fs";
import { constants as fsConstants } from "node:fs";
import * as path from "node:path";
import {
  inspectContainedInstructionDirectory,
  inspectContainedInstructionPath,
} from "./fileWriter.cjs";

const FIXED_SOURCES = ["AGENTS.md", ".bryantlabs/rules.md", ".cursorrules"] as const;
const CURSOR_RULES_DIR = ".cursor/rules";
const MAX_MDC_CANDIDATES = 32;
const MAX_INSTRUCTION_DIR_ENTRIES = 64;
const MAX_INSTRUCTION_FILE_BYTES = 32_768;
const MAX_INSTRUCTION_TOTAL_BYTES = 65_536;
const MAX_INSTRUCTION_DIAGNOSTICS = 24;
const MAX_REL_PATH_CHARS = 256;

export type InstructionPackSkipReason =
  | "not_found"
  | "empty"
  | "not_regular_file"
  | "outside_root"
  | "symlink_escape"
  | "duplicate"
  | "unreadable"
  | "over_file_budget"
  | "candidate_limit";

export interface InstructionPackSkip {
  readonly path: string;
  readonly reason: InstructionPackSkipReason;
}

export interface TrustedInstructionSource {
  readonly relativePath: string;
  readonly body: string;
}

export interface TrustedInstructionLoad {
  readonly sources: TrustedInstructionSource[];
  readonly skipped: InstructionPackSkip[];
}

function isFsCode(err: unknown, code: string): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === code);
}

function isSafeRelative(rel: string): boolean {
  if (!rel || rel.length > MAX_REL_PATH_CHARS) return false;
  if (rel.includes("\0") || rel.includes("\\") || path.isAbsolute(rel)) return false;
  const parts = rel.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function compareLexicalRelPath(a: string, b: string): number {
  const left = a.normalize("NFC");
  const right = b.normalize("NFC");
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function capSkipped(skipped: InstructionPackSkip[]): InstructionPackSkip[] {
  if (skipped.length <= MAX_INSTRUCTION_DIAGNOSTICS) return skipped;
  return [
    ...skipped.slice(0, MAX_INSTRUCTION_DIAGNOSTICS - 1),
    { path: CURSOR_RULES_DIR, reason: "candidate_limit" },
  ];
}

function decodeInstructionUtf8(buf: Buffer): string {
  return buf.toString("utf8");
}

export function readContainedInstructionFile(
  root: string,
  relativePath: string,
  budgets: { remainingBytes: number },
):
  | { readonly ok: true; readonly relativePath: string; readonly canonicalPath: string; readonly body: string; readonly bytes: number }
  | { readonly ok: false; readonly reason: InstructionPackSkipReason } {
  if (!isSafeRelative(relativePath)) {
    return { ok: false, reason: "outside_root" };
  }
  const target = path.join(root, ...relativePath.split("/"));
  const inspected = inspectContainedInstructionPath(root, target);
  if (!inspected.ok) return { ok: false, reason: inspected.reason };

  const noFollow =
    typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
  let fd: number;
  try {
    fd = fsSync.openSync(inspected.canonicalPath, fsConstants.O_RDONLY | noFollow);
  } catch (err) {
    if (isFsCode(err, "ELOOP") || isFsCode(err, "EPERM")) {
      return { ok: false, reason: "symlink_escape" };
    }
    if (isFsCode(err, "ENOENT")) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "unreadable" };
  }

  try {
    const st = fsSync.fstatSync(fd);
    if (!st.isFile()) return { ok: false, reason: "not_regular_file" };
    if (st.size <= 0) return { ok: false, reason: "empty" };
    if (st.size > MAX_INSTRUCTION_FILE_BYTES) return { ok: false, reason: "over_file_budget" };
    if (st.size > budgets.remainingBytes) return { ok: false, reason: "over_file_budget" };

    const buf = Buffer.alloc(st.size);
    const read = fsSync.readSync(fd, buf, 0, buf.length, 0);
    if (read < 0) return { ok: false, reason: "unreadable" };
    const slice = read === buf.length ? buf : buf.subarray(0, read);
    if (slice.includes(0)) return { ok: false, reason: "unreadable" };
    const body = decodeInstructionUtf8(slice);
    if (!body.trim()) return { ok: false, reason: "empty" };
    return {
      ok: true,
      relativePath: inspected.relativePath,
      canonicalPath: inspected.canonicalPath,
      body,
      bytes: slice.length,
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    fsSync.closeSync(fd);
  }
}

function listMdcCandidateNames(root: string, skipped: InstructionPackSkip[]): string[] {
  const dirTarget = path.join(root, ".cursor", "rules");
  const inspected = inspectContainedInstructionDirectory(root, dirTarget);
  if (!inspected.ok) {
    if (inspected.reason !== "not_found") {
      skipped.push({ path: CURSOR_RULES_DIR, reason: inspected.reason });
    }
    return [];
  }

  let entries: fsSync.Dirent[];
  try {
    entries = fsSync.readdirSync(inspected.canonicalPath, { withFileTypes: true });
  } catch {
    skipped.push({ path: CURSOR_RULES_DIR, reason: "unreadable" });
    return [];
  }

  const scanned = entries.slice(0, MAX_INSTRUCTION_DIR_ENTRIES);
  if (entries.length > MAX_INSTRUCTION_DIR_ENTRIES) {
    skipped.push({ path: CURSOR_RULES_DIR, reason: "candidate_limit" });
  }

  const names: string[] = [];
  for (const entry of scanned) {
    if (!entry.name.toLowerCase().endsWith(".mdc")) continue;
    if (entry.name.includes("\0") || entry.name.includes("/") || entry.name.includes("\\")) {
      continue;
    }
    names.push(entry.name);
  }
  names.sort(compareLexicalRelPath);
  if (names.length > MAX_MDC_CANDIDATES) {
    skipped.push({ path: CURSOR_RULES_DIR, reason: "candidate_limit" });
    return names.slice(0, MAX_MDC_CANDIDATES);
  }
  return names;
}

export function loadTrustedInstructionSources(root: string): TrustedInstructionLoad {
  const sources: TrustedInstructionSource[] = [];
  const skipped: InstructionPackSkip[] = [];
  const seenCanonical = new Set<string>();
  const budgets = { remainingBytes: MAX_INSTRUCTION_TOTAL_BYTES };

  for (const rel of FIXED_SOURCES) {
    const result = readContainedInstructionFile(root, rel, budgets);
    if (!result.ok) {
      if (result.reason !== "not_found") {
        skipped.push({ path: rel, reason: result.reason });
      }
      continue;
    }
    if (seenCanonical.has(result.canonicalPath)) {
      skipped.push({ path: rel, reason: "duplicate" });
      continue;
    }
    seenCanonical.add(result.canonicalPath);
    sources.push({ relativePath: result.relativePath, body: result.body });
    budgets.remainingBytes -= result.bytes;
  }

  const mdcNames = listMdcCandidateNames(root, skipped);
  for (const name of mdcNames) {
    const rel = `${CURSOR_RULES_DIR}/${name}`;
    const result = readContainedInstructionFile(root, rel, budgets);
    if (!result.ok) {
      skipped.push({ path: rel, reason: result.reason });
      continue;
    }
    if (seenCanonical.has(result.canonicalPath)) {
      skipped.push({ path: rel, reason: "duplicate" });
      continue;
    }
    seenCanonical.add(result.canonicalPath);
    sources.push({ relativePath: result.relativePath, body: result.body });
    budgets.remainingBytes -= result.bytes;
  }

  return { sources, skipped: capSkipped(skipped) };
}
