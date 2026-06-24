import type { DiagnosticReportSnapshot } from "@/core/diagnostics/diagnosticReport";
import { resolveRunHistoryScope } from "@/core/agent/agentRunHistory";

const STORAGE_PREFIX = "bryantlabs.diagnosticReports.";
export const MAX_DIAGNOSTIC_REPORTS = 25;

export interface StoredDiagnosticReport {
  readonly runId: string;
  readonly runNumber: number | null;
  readonly capturedAt: string;
  readonly status: DiagnosticReportSnapshot["status"];
  readonly snapshot: DiagnosticReportSnapshot;
  readonly text: string;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

export function loadDiagnosticReports(scope: string): StoredDiagnosticReport[] {
  if (!scope) return [];
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredDiagnosticReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDiagnosticReports(
  scope: string,
  reports: readonly StoredDiagnosticReport[],
): void {
  if (!scope) return;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(reports.slice(-MAX_DIAGNOSTIC_REPORTS)));
  } catch {
    /* ignore quota */
  }
}

export function captureDiagnosticReport(input: {
  readonly scope: string;
  readonly runNumber?: number | null;
  readonly snapshot: DiagnosticReportSnapshot;
  readonly text: string;
}): StoredDiagnosticReport[] {
  const existing = loadDiagnosticReports(input.scope);
  const entry: StoredDiagnosticReport = {
    runId: input.snapshot.runId,
    runNumber: input.runNumber ?? null,
    capturedAt: input.snapshot.timestamp,
    status: input.snapshot.status,
    snapshot: input.snapshot,
    text: input.text,
  };
  const withoutDup = existing.filter((item) => item.runId !== entry.runId);
  const next = [...withoutDup, entry].slice(-MAX_DIAGNOSTIC_REPORTS);
  saveDiagnosticReports(input.scope, next);
  return next;
}

export function findDiagnosticReport(
  scope: string,
  runId: string | null | undefined,
): StoredDiagnosticReport | null {
  if (!scope || !runId) return null;
  return loadDiagnosticReports(scope).find((item) => item.runId === runId) ?? null;
}

export function resolveDiagnosticReportScope(
  projectPath: string | undefined | null,
): string {
  return resolveRunHistoryScope(projectPath);
}

export function mergeSessionDiagnosticReportsIntoProject(projectPath: string): void {
  const trimmed = projectPath.trim();
  if (!trimmed) return;
  const session = loadDiagnosticReports(resolveRunHistoryScope(null));
  if (session.length === 0) return;
  const project = loadDiagnosticReports(trimmed);
  const seen = new Set(project.map((item) => item.runId));
  const merged = [...project];
  for (const item of session) {
    if (seen.has(item.runId)) continue;
    seen.add(item.runId);
    merged.push(item);
  }
  saveDiagnosticReports(trimmed, merged);
  saveDiagnosticReports(resolveRunHistoryScope(null), []);
}
