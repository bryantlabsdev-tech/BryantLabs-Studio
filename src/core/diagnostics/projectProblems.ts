export type ProjectProblemSeverity = "error" | "warning";
export type ProjectProblemSource = "typescript" | "monaco";

export interface ProjectProblem {
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
  readonly problems: readonly ProjectProblem[];
  readonly ranAt: number | null;
  readonly error: string | null;
  readonly errorCount: number;
  readonly warningCount: number;
}

export const IDLE_PROJECT_PROBLEMS_STATUS: ProjectProblemsStatus = {
  state: "idle",
  problems: [],
  ranAt: null,
  error: null,
  errorCount: 0,
  warningCount: 0,
};

export function normalizeAbsPath(absPath: string): string {
  const decoded = absPath.startsWith("file://")
    ? decodeURIComponent(absPath.replace(/^file:\/\//, ""))
    : absPath;
  return decoded.replace(/\\/g, "/");
}

export function toRelativeProjectPath(projectRoot: string, absPath: string): string {
  const normRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const normAbs = normalizeAbsPath(absPath);
  if (normAbs.startsWith(`${normRoot}/`)) {
    return normAbs.slice(normRoot.length + 1);
  }
  return normAbs;
}

export function problemKey(problem: ProjectProblem): string {
  return `${problem.absFile}:${problem.line}:${problem.column}:${problem.code}:${problem.severity}:${problem.source}`;
}

export function problemLocationKey(problem: ProjectProblem): string {
  return `${problem.absFile}:${problem.line}:${problem.column}:${problem.code}:${problem.severity}`;
}

export function countProblemSeverities(
  problems: readonly ProjectProblem[],
): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;
  for (const problem of problems) {
    if (problem.severity === "error") errorCount += 1;
    else warningCount += 1;
  }
  return { errorCount, warningCount };
}

export function mergeProjectProblems(
  typescript: readonly ProjectProblem[],
  monaco: readonly ProjectProblem[],
): ProjectProblem[] {
  const map = new Map<string, ProjectProblem>();
  for (const problem of typescript) {
    map.set(problemLocationKey(problem), problem);
  }
  for (const problem of monaco) {
    const key = problemLocationKey(problem);
    if (!map.has(key)) {
      map.set(key, problem);
    }
  }
  return [...map.values()].sort((a, b) => {
    const fileCmp = a.file.localeCompare(b.file);
    if (fileCmp !== 0) return fileCmp;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.code.localeCompare(b.code);
  });
}

export interface MonacoMarkerLike {
  readonly resource: { readonly path: string };
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly code?: string | { readonly value: string };
  readonly message: string;
  readonly severity: number;
}

const MONACO_ERROR = 8;
const MONACO_WARNING = 4;

export function markerSeverity(
  severity: number,
): ProjectProblemSeverity | null {
  if (severity === MONACO_ERROR) return "error";
  if (severity === MONACO_WARNING) return "warning";
  return null;
}

export function markerCode(code: MonacoMarkerLike["code"]): string {
  if (!code) return "";
  if (typeof code === "string") return code;
  return code.value;
}

export function monacoMarkersToProblems(
  projectRoot: string,
  markers: readonly MonacoMarkerLike[],
): ProjectProblem[] {
  const normRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const problems: ProjectProblem[] = [];

  for (const marker of markers) {
    const severity = markerSeverity(marker.severity);
    if (!severity) continue;
    const absFile = normalizeAbsPath(marker.resource.path);
    if (!absFile.startsWith(`${normRoot}/`)) continue;
    problems.push({
      file: toRelativeProjectPath(projectRoot, absFile),
      absFile,
      line: marker.startLineNumber,
      column: marker.startColumn,
      code: markerCode(marker.code),
      message: marker.message,
      severity,
      source: "monaco",
    });
  }

  return problems;
}

export function mergeProblemsStatus(
  tscStatus: ProjectProblemsStatus,
  mergedProblems: readonly ProjectProblem[],
): ProjectProblemsStatus {
  const counts = countProblemSeverities(mergedProblems);
  return {
    ...tscStatus,
    problems: mergedProblems,
    ...counts,
  };
}
