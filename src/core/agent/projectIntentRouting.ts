import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import type { ProjectScan } from "@/types";

export function normalizeScanPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function hasProjectScaffoldMarkers(
  scan: ProjectScan | null,
  filesWritten: readonly string[] = [],
): boolean {
  const paths = new Set<string>();
  for (const file of scan?.files ?? []) {
    paths.add(normalizeScanPath(file.path));
  }
  for (const path of filesWritten) {
    paths.add(normalizeScanPath(path));
  }

  const hasPackageJson = [...paths].some(
    (path) => path === "package.json" || path.endsWith("/package.json"),
  );
  const hasAppEntry = [...paths].some(
    (path) =>
      path === "src/App.tsx" ||
      path === "src/app.tsx" ||
      path.endsWith("/src/App.tsx") ||
      path.endsWith("/src/app.tsx"),
  );
  const hasIndexHtml = [...paths].some(
    (path) => path === "index.html" || path.endsWith("/index.html"),
  );

  return hasPackageJson && (hasAppEntry || hasIndexHtml);
}

export function promptReferencesCurrentApp(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 4) return false;
  return /\b(this|the|current)\s+(app|project|calculator|dashboard|game|component)\b/i.test(
      trimmed,
    ) ||
    /\bcalculator\b/i.test(trimmed) ||
    /\bhistory\s+(feature|section|panel|list)\b/i.test(trimmed) ||
    /\badd\s+(calculation\s+)?history\b/i.test(trimmed);
}

export function resolveEstablishedProject(input: {
  readonly projectOpen: boolean;
  readonly scan: ProjectScan | null;
  readonly fallbackSourceFileCount?: number;
  readonly filesWritten?: readonly string[];
  readonly previousSuccessfulRun?: boolean;
}): boolean {
  if (!input.projectOpen) return false;
  if (isExistingEditableProject(input.projectOpen, input.scan)) return true;
  if ((input.fallbackSourceFileCount ?? 0) > 0) return true;
  if (hasProjectScaffoldMarkers(input.scan, input.filesWritten ?? [])) return true;
  if (
    input.previousSuccessfulRun === true &&
    (input.filesWritten?.length ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

export function isExistingEditableProject(
  projectOpen: boolean,
  scan: ProjectScan | null,
): boolean {
  if (!projectOpen || !scan) return false;
  return scanHasPackageJson(scan) && countProjectSourceFiles(scan) > 0;
}

export function scanHasPackageJson(scan: ProjectScan | null): boolean {
  if (!scan) return false;
  const hasFile = scan.files.some((f) => {
    const p = normalizeScanPath(f.path ?? "");
    return p === "package.json" || p.endsWith("/package.json");
  });
  if (hasFile) return true;
  return scan.summary?.detections?.packageJson === true;
}

export type IntentRouteMode = "edit" | "greenfield";

export function logIntentRoute(
  mode: IntentRouteMode,
  reason: string,
  projectPath?: string | null,
): void {
  const pathSuffix = projectPath ? ` projectPath=${projectPath}` : "";
  console.log(`[intent:route] mode=${mode} reason=${reason}${pathSuffix}`);
}

export function logEditStart(projectPath: string): void {
  console.log(`[edit:start] projectPath=${projectPath}`);
}

export function logPatchGenerated(files: readonly string[]): void {
  console.log(`[patch:generated] files=${files.join(",")}`);
}
