import path from "node:path";
import type { BrowserWindow } from "electron";
import { parseTypeScriptDiagnostics } from "../greenfield/tscDiagnostics.cjs";
import { runTypecheckOnly } from "../verifier.cjs";

export type ProjectProblemSeverity = "error" | "warning";
export type ProjectProblemSource = "typescript";

export interface ProjectProblemRecord {
  readonly file: string;
  readonly absFile: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
  readonly message: string;
  readonly severity: ProjectProblemSeverity;
  readonly source: ProjectProblemSource;
}

export type ProjectProblemsState = "idle" | "scanning" | "ready" | "stale";

export interface ProjectProblemsStatus {
  readonly state: ProjectProblemsState;
  readonly problems: readonly ProjectProblemRecord[];
  readonly ranAt: number | null;
  readonly error: string | null;
  readonly errorCount: number;
  readonly warningCount: number;
}

const DEBOUNCE_MS = 1_500;

const IDLE_STATUS: ProjectProblemsStatus = {
  state: "idle",
  problems: [],
  ranAt: null,
  error: null,
  errorCount: 0,
  warningCount: 0,
};

let activeRoot: string | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let refreshChain: Promise<void> = Promise.resolve();
let lastStatus: ProjectProblemsStatus = IDLE_STATUS;
let getWindow: (() => BrowserWindow | null) | null = null;

function countSeverities(
  problems: readonly ProjectProblemRecord[],
): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;
  for (const problem of problems) {
    if (problem.severity === "error") errorCount += 1;
    else warningCount += 1;
  }
  return { errorCount, warningCount };
}

function emitUpdated(): void {
  const win = getWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send("project:problems-updated", lastStatus);
}

function toProblemRecord(
  root: string,
  diag: ReturnType<typeof parseTypeScriptDiagnostics>[number],
): ProjectProblemRecord {
  const absFile = path.isAbsolute(diag.file)
    ? path.normalize(diag.file)
    : path.join(root, diag.file);
  const relFile = path.relative(root, absFile).replace(/\\/g, "/");
  return {
    file: relFile,
    absFile,
    line: diag.line,
    column: diag.column,
    code: diag.code,
    message: diag.message,
    severity: diag.category,
    source: "typescript",
  };
}

function markStaleIfReady(): void {
  if (lastStatus.state !== "ready" || lastStatus.ranAt == null) return;
  lastStatus = { ...lastStatus, state: "stale" };
  emitUpdated();
}

export function bindProjectProblemsWindow(
  windowGetter: () => BrowserWindow | null,
): void {
  getWindow = windowGetter;
}

export function resetProjectProblemsState(): void {
  activeRoot = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  refreshChain = Promise.resolve();
  lastStatus = IDLE_STATUS;
}

export function getProjectProblemsStatus(): ProjectProblemsStatus {
  return lastStatus;
}

export function scheduleProjectProblemsRefresh(root: string): void {
  if (activeRoot && activeRoot !== root) return;
  activeRoot = root;
  markStaleIfReady();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void refreshProjectProblems(root);
  }, DEBOUNCE_MS);
}

export async function refreshProjectProblems(
  root: string,
): Promise<ProjectProblemsStatus> {
  activeRoot = root;
  lastStatus = {
    ...lastStatus,
    state: "scanning",
    error: null,
  };
  emitUpdated();

  refreshChain = refreshChain
    .then(async () => {
      if (activeRoot !== root) return;
      try {
        const result = await runTypecheckOnly(root);
        if (activeRoot !== root) return;
        const diagnostics = parseTypeScriptDiagnostics(
          result.stdout,
          result.stderr,
        );
        const problems = diagnostics.map((diag) => toProblemRecord(root, diag));
        const counts = countSeverities(problems);
        lastStatus = {
          state: "ready",
          problems,
          ranAt: Date.now(),
          error: result.timedOut
            ? "Type-check timed out"
            : null,
          ...counts,
        };
      } catch (err) {
        if (activeRoot !== root) return;
        lastStatus = {
          state: "ready",
          problems: [],
          ranAt: Date.now(),
          error: err instanceof Error ? err.message : String(err),
          errorCount: 0,
          warningCount: 0,
        };
      }
      emitUpdated();
    })
    .catch(() => undefined);

  await refreshChain;
  return lastStatus;
}
