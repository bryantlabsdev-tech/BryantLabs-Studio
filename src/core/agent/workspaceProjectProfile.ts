import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import {
  hasProjectScaffoldMarkers,
  isExistingEditableProject,
  normalizeScanPath,
} from "@/core/agent/projectIntentRouting";
import type { ProjectScan } from "@/types";

export interface WorkspaceProjectProfile {
  readonly projectPath: string | null;
  readonly workspaceLabel: string;
  readonly hasPackageJson: boolean;
  readonly hasSrcDirectory: boolean;
  readonly hasAppEntry: boolean;
  readonly hasMainEntry: boolean;
  readonly hasIndexHtml: boolean;
  readonly hasGitRepo: boolean;
  readonly hasProjectIndex: boolean;
  readonly sourceFileCount: number;
  readonly isEmptyWorkspace: boolean;
  readonly isExistingApplication: boolean;
  readonly applicationLabel: string | null;
}

export interface InspectWorkspaceProjectProfileInput {
  readonly projectOpen: boolean;
  readonly projectPath: string | null;
  readonly scan: ProjectScan | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly filesWritten?: readonly string[];
  readonly fallbackSourceFileCount?: number;
  readonly hasGitRepo?: boolean;
  readonly hasProjectIndex?: boolean;
}

function scanPaths(scan: ProjectScan | null, filesWritten: readonly string[]): Set<string> {
  const paths = new Set<string>();
  for (const file of scan?.files ?? []) {
    if (file.path) paths.add(normalizeScanPath(file.path));
  }
  for (const path of filesWritten) {
    paths.add(normalizeScanPath(path));
  }
  return paths;
}

function pathExists(paths: Set<string>, suffix: string): boolean {
  return [...paths].some(
    (path) => path === suffix || path.endsWith(`/${suffix}`),
  );
}

function hasSrcTree(paths: Set<string>): boolean {
  return [...paths].some((path) => path === "src" || path.startsWith("src/"));
}

export function workspaceLabelFromPath(projectPath: string | null): string {
  if (!projectPath?.trim()) return "No folder open";
  const normalized = projectPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

export function inferApplicationLabel(scan: ProjectScan | null): string | null {
  if (!scan) return null;
  const framework = scan.summary.framework?.trim();
  if (framework) {
    return `${framework} application`;
  }
  if (scan.summary.detections.tsconfig) return "TypeScript application";
  if (countProjectSourceFiles(scan) > 0) return "Application";
  return null;
}

/** Project-aware workspace inspection — structure over prompt wording. */
export function inspectWorkspaceProjectProfile(
  input: InspectWorkspaceProjectProfileInput,
): WorkspaceProjectProfile {
  const filesWritten = input.filesWritten ?? [];
  const paths = scanPaths(input.scan, filesWritten);
  const sourceFileCount = Math.max(
    input.scan ? countProjectSourceFiles(input.scan) : 0,
    input.fallbackSourceFileCount ?? 0,
  );
  const hasPackageJson = pathExists(paths, "package.json");
  const hasAppEntry =
    pathExists(paths, "src/App.tsx") || pathExists(paths, "src/app.tsx");
  const hasMainEntry =
    pathExists(paths, "src/main.tsx") || pathExists(paths, "src/main.ts");
  const hasIndexHtml = pathExists(paths, "index.html");
  const hasSrcDirectory = hasSrcTree(paths);
  const scaffold = hasProjectScaffoldMarkers(input.scan, filesWritten);
  const editable =
    input.projectOpen && isExistingEditableProject(input.projectOpen, input.scan);
  const hasProjectIndex =
    input.hasProjectIndex === true ||
    (input.scan != null && input.scanStatus === "done" && input.scan.files.length > 0);

  const isExistingApplication =
    editable ||
    sourceFileCount > 0 ||
    scaffold ||
    (input.fallbackSourceFileCount ?? 0) > 0 ||
    filesWritten.length > 0;

  const isEmptyWorkspace =
    input.projectOpen &&
    !isExistingApplication &&
    sourceFileCount === 0 &&
    !scaffold;

  const applicationLabel = isExistingApplication
    ? inferApplicationLabel(input.scan)
    : null;

  return {
    projectPath: input.projectPath,
    workspaceLabel: workspaceLabelFromPath(input.projectPath),
    hasPackageJson,
    hasSrcDirectory,
    hasAppEntry,
    hasMainEntry,
    hasIndexHtml,
    hasGitRepo: input.hasGitRepo === true,
    hasProjectIndex,
    sourceFileCount,
    isEmptyWorkspace,
    isExistingApplication,
    applicationLabel,
  };
}

export function profileSignature(profile: WorkspaceProjectProfile): string {
  const kind = profile.isExistingApplication ? "app" : profile.isEmptyWorkspace ? "empty" : "partial";
  return `${profile.workspaceLabel}:${kind}:${profile.sourceFileCount}`;
}

/** Suggest a sibling folder for "create new app" (e.g. A30 → A31). */
export function suggestSiblingProjectFolder(projectPath: string | null): string | null {
  if (!projectPath?.trim()) return null;
  const normalized = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
  const slash = normalized.lastIndexOf("/");
  const parent = slash >= 0 ? normalized.slice(0, slash) : "";
  const base = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const numbered = base.match(/^(.+?)(\d+)$/);
  if (numbered) {
    const next = `${numbered[1]}${Number(numbered[2]) + 1}`;
    return parent ? `${parent}/${next}` : next;
  }
  const suggested = `${base}-new`;
  return parent ? `${parent}/${suggested}` : suggested;
}
