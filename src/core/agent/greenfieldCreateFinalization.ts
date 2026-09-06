import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import type { ProjectScan } from "@/types";

const SOURCE_HINT_RE = /(^|\/)(App|main|index)\.(tsx?|jsx?)$/i;
const SOURCE_FILE_RE = /\.(tsx?|jsx?|vue|svelte|css)$/i;

export function pathLooksLikeAppSource(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  return SOURCE_FILE_RE.test(normalized);
}

export function knownPathsIncludeAppSources(paths: readonly string[]): boolean {
  return paths.some(
    (path) => SOURCE_HINT_RE.test(path.replace(/\\/g, "/")) || pathLooksLikeAppSource(path),
  );
}

/**
 * `scanStatus: done` with zero indexed sources is only stable for a truly empty
 * folder. After greenfield writes (App.tsx exists in filesWritten or on disk),
 * it is a stale cache and must not be treated as context-ready.
 */
export function isUnstableEmptyDoneScan(input: {
  readonly scanStatus: string;
  readonly scan: ProjectScan | null;
  readonly knownSourcePaths: readonly string[];
}): boolean {
  if (input.scanStatus !== "done") return false;
  if (countProjectSourceFiles(input.scan) > 0) return false;
  return knownPathsIncludeAppSources(input.knownSourcePaths);
}

export function projectScanFileIdentity(scan: ProjectScan | null): string {
  if (!scan) return "";
  return scan.files
    .map((file) => `${file.path}\0${file.absPath ?? ""}`)
    .join("\n");
}

export function projectScansEquivalent(
  a: ProjectScan | null,
  b: ProjectScan | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return projectScanFileIdentity(a) === projectScanFileIdentity(b);
}

export type CreateFinalizationWorkKind =
  | "rescan"
  | "ui_audit"
  | "ui_repair"
  | "preview"
  | "finalize";

const inFlightWork = new Map<string, Promise<unknown>>();

export function createFinalizationWorkKey(
  kind: CreateFinalizationWorkKind,
  projectPath: string,
  extra = "",
): string {
  return `${kind}::${projectPath}::${extra}`;
}

/** StrictMode / double projection: share one in-flight job per key. */
export function runCreateFinalizationWorkOnce<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const existing = inFlightWork.get(key);
  if (existing) return existing as Promise<T>;
  const pending = Promise.resolve()
    .then(work)
    .finally(() => {
      if (inFlightWork.get(key) === pending) inFlightWork.delete(key);
    });
  inFlightWork.set(key, pending);
  return pending;
}

export function resetCreateFinalizationWorkForTests(): void {
  inFlightWork.clear();
}

export interface CreateFinalizationScanDecision {
  readonly acceptAsDone: boolean;
  readonly forceRescan: boolean;
  readonly indexedSourceFileCount: number;
}

export function decideScanAfterGreenfieldWrites(input: {
  readonly scan: ProjectScan | null;
  readonly scanStatus: string;
  readonly knownSourcePaths: readonly string[];
}): CreateFinalizationScanDecision {
  const indexedSourceFileCount = countProjectSourceFiles(input.scan);
  if (indexedSourceFileCount > 0) {
    return { acceptAsDone: true, forceRescan: false, indexedSourceFileCount };
  }
  const known = knownPathsIncludeAppSources(input.knownSourcePaths);
  return {
    acceptAsDone: !known && input.scanStatus === "done",
    forceRescan: known,
    indexedSourceFileCount,
  };
}

const REACT_MAX_UPDATE_DEPTH = 50;

export interface CreateFinalizationUpdateTrace {
  readonly component: string;
  readonly effect: string;
  readonly field: string;
  readonly prevIdentity: string;
  readonly nextIdentity: string;
  readonly prevEqualsNext: boolean;
  readonly trigger: string;
  readonly updateCount: number;
}

export interface CreateFinalizationLoopModel {
  readonly traces: CreateFinalizationUpdateTrace[];
  readonly renderCount: number;
  readonly effectCount: number;
  readonly rescanCount: number;
  readonly auditCount: number;
  readonly repairCount: number;
  readonly generateCount: number;
  readonly indexedSourceFileCount: number;
  readonly scanStatus: string;
  readonly runResult: "success" | "failed" | "running";
  readonly runActive: boolean;
  readonly previewReady: boolean;
  readonly falseApplyFailureNarration: boolean;
  readonly exceededMaxDepth: boolean;
}

/**
 * Models the preserved real-create sequence and counts nested identity-churn
 * the way React's max-update-depth limiter does (no timers).
 */
export function simulateRealProviderCreateFinalization(input: {
  readonly unstableAnalyticsKey: boolean;
  readonly acceptEmptyDoneScan: boolean;
  readonly narrateUiAuditAsApplyFailure: boolean;
  readonly duplicateStrictWork: boolean;
}): CreateFinalizationLoopModel {
  const traces: CreateFinalizationUpdateTrace[] = [];
  let renderCount = 0;
  let effectCount = 0;
  let rescanCount = 0;
  let auditCount = 0;
  let repairCount = 0;
  const generateCount = 1;
  let analyticsKey = "";
  let scanStatus = "done";
  let indexed = 0;
  let persistCallbackId = 0;
  let greenfieldRunId = 1;
  let falseApplyFailureNarration = input.narrateUiAuditAsApplyFailure;

  const known = [
    "package.json",
    "index.html",
    "src/main.tsx",
    "tsconfig.json",
    "vite.config.ts",
    "src/index.css",
    "src/App.tsx",
  ];

  const runAuditRepair = () => {
    auditCount += 1;
    repairCount += 1;
    auditCount += 1;
  };

  if (input.duplicateStrictWork) {
    runAuditRepair();
    runAuditRepair();
  } else {
    runAuditRepair();
  }

  const commitAnalytics = (clock: number) => {
    effectCount += 1;
    const nextKey = input.unstableAnalyticsKey
      ? `analytics-${clock}`
      : "greenfield:/tmp/app:started:success";
    const prev = analyticsKey;
    if (prev === nextKey) return false;
    analyticsKey = nextKey;
    persistCallbackId += 1;
    greenfieldRunId += 1;
    traces.push({
      component: "WorkspaceProvider",
      effect: "persistGreenfieldAnalytics",
      field: "analyticsHistory",
      prevIdentity: prev || "(empty)",
      nextIdentity: nextKey,
      prevEqualsNext: false,
      trigger: "persistAnalyticsRecord identity",
      updateCount: traces.length + 1,
    });
    return true;
  };

  let clock = 1_000;
  let nested = 0;
  while (nested < REACT_MAX_UPDATE_DEPTH + 5) {
    renderCount += 1;
    nested += 1;
    const changed = commitAnalytics(clock);
    if (input.unstableAnalyticsKey) clock += 1;
    persistCallbackId += 1;
    if (!changed) break;
  }

  if (!input.acceptEmptyDoneScan) {
    const decision = decideScanAfterGreenfieldWrites({
      scan: null,
      scanStatus: "done",
      knownSourcePaths: known,
    });
    if (decision.forceRescan) {
      rescanCount = 1;
      indexed = 3;
      scanStatus = "done";
    }
  } else {
    scanStatus = "done";
    indexed = 0;
  }

  if (!input.narrateUiAuditAsApplyFailure) {
    falseApplyFailureNarration = false;
  }

  return {
    traces,
    renderCount,
    effectCount,
    rescanCount,
    auditCount,
    repairCount,
    generateCount,
    indexedSourceFileCount: indexed,
    scanStatus,
    runResult: "success",
    runActive: false,
    previewReady: true,
    falseApplyFailureNarration,
    exceededMaxDepth: nested > REACT_MAX_UPDATE_DEPTH,
  };
}
