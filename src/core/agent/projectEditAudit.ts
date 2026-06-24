import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import {
  logProjectAudit,
  logProjectFiles,
} from "@/core/agent/editPipelineLogs";
import { scanHasPackageJson } from "@/core/agent/projectIntentRouting";
import type { ProjectScan } from "@/types";

const SOURCE_RE = /\.(tsx?|jsx?|vue|svelte|css|scss)$/i;

export interface ProjectEditAuditResult {
  readonly projectType: string;
  readonly framework: string;
  readonly typescript: boolean;
  readonly scripts: readonly string[];
  readonly entryFile: string | null;
  readonly appFile: string | null;
  readonly keyFiles: readonly string[];
  readonly featureHints: readonly string[];
  readonly safestEditTargets: readonly string[];
  readonly sourceFileCount: number;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function findAppRootFile(scan: ProjectScan): string | null {
  const paths = scan.files.map((f) => normalizePath(f.path));
  const preferred = [
    "src/App.tsx",
    "src/App.jsx",
    "src/app/App.tsx",
    "app/page.tsx",
    "src/main.tsx",
  ];
  for (const p of preferred) {
    if (paths.includes(p)) return p;
  }
  const appTsx = paths.find((p) => /\/App\.(tsx|jsx)$/.test(p));
  return appTsx ?? null;
}

function findEntryFile(scan: ProjectScan): string | null {
  const entry = scan.summary.entryPoints.map(normalizePath).find(Boolean);
  if (entry) return entry;
  const paths = scan.files.map((f) => normalizePath(f.path));
  for (const p of ["src/main.tsx", "src/main.ts", "src/index.tsx", "index.html"]) {
    if (paths.includes(p)) return p;
  }
  return null;
}

function inferScripts(scan: ProjectScan): string[] {
  const scripts = new Set<string>(["build"]);
  if (scan.summary.detections.tsconfig) scripts.add("typecheck");
  if (scan.summary.detections.viteConfig || scan.summary.bundler === "Vite") {
    scripts.add("dev");
    scripts.add("preview");
  }
  if (scan.summary.detections.electron) scripts.add("electron:dev");
  return [...scripts];
}

function inferProjectType(scan: ProjectScan): string {
  const d = scan.summary.detections;
  if (d.electron && d.react) return "electron-react";
  if (d.nextjs) return "nextjs";
  if (d.react && d.viteConfig) return "vite-react";
  if (d.react) return "react";
  if (d.node) return "node";
  return scan.summary.framework.toLowerCase().replace(/\s+/g, "-") || "unknown";
}

function collectFeatureHints(scan: ProjectScan): string[] {
  const hints = new Set<string>();
  for (const file of scan.index) {
    for (const c of file.components) hints.add(`component:${c}`);
    for (const h of file.hooks) hints.add(`hook:${h}`);
    for (const fn of file.functions.slice(0, 3)) hints.add(`function:${fn}`);
  }
  return [...hints].slice(0, 12);
}

function collectKeyFiles(scan: ProjectScan): string[] {
  const paths = scan.files.map((f) => normalizePath(f.path));
  const priority = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "src/main.tsx",
    "src/App.tsx",
    "src/index.css",
    "index.html",
  ];
  const picked = priority.filter((p) => paths.includes(p));
  const sources = paths
    .filter((p) => SOURCE_RE.test(p) && p.startsWith("src/"))
    .slice(0, 8);
  return [...new Set([...picked, ...sources])].slice(0, 12);
}

function collectSafestEditTargets(scan: ProjectScan): string[] {
  const paths = scan.files
    .map((f) => normalizePath(f.path))
    .filter((p) => SOURCE_RE.test(p) && p.startsWith("src/") && !p.includes(".test."));
  const app = findAppRootFile(scan);
  const ranked = [...paths].sort((a, b) => {
    if (app && a === app) return -1;
    if (app && b === app) return 1;
    if (a.includes("/components/") && !b.includes("/components/")) return -1;
    if (b.includes("/components/") && !a.includes("/components/")) return 1;
    return a.localeCompare(b);
  });
  return ranked.slice(0, 8);
}

export function auditProjectForEdit(scan: ProjectScan | null): ProjectEditAuditResult | null {
  if (!scan || !scanHasPackageJson(scan)) return null;
  if (countProjectSourceFiles(scan) === 0) return null;

  const framework = inferProjectType(scan);
  const typescript = scan.summary.detections.tsconfig;
  const scripts = inferScripts(scan);
  const entryFile = findEntryFile(scan);
  const appFile = findAppRootFile(scan);
  const keyFiles = collectKeyFiles(scan);
  const featureHints = collectFeatureHints(scan);
  const safestEditTargets = collectSafestEditTargets(scan);
  const sourceFileCount = countProjectSourceFiles(scan);

  return {
    projectType: framework,
    framework: scan.summary.framework,
    typescript,
    scripts,
    entryFile,
    appFile,
    keyFiles,
    featureHints,
    safestEditTargets,
    sourceFileCount,
  };
}

export function runProjectEditAudit(scan: ProjectScan | null): ProjectEditAuditResult | null {
  const audit = auditProjectForEdit(scan);
  if (!audit) return null;

  logProjectAudit(
    `framework=${audit.projectType} typescript=${audit.typescript} scripts=${audit.scripts.join(",")}`,
  );
  logProjectFiles(
    [
      audit.entryFile ? `entry=${audit.entryFile}` : null,
      audit.appFile ? `app=${audit.appFile}` : null,
      audit.keyFiles.length ? `key=${audit.keyFiles.join(",")}` : null,
      audit.safestEditTargets.length
        ? `edit=${audit.safestEditTargets.join(",")}`
        : null,
      audit.featureHints.length ? `features=${audit.featureHints.slice(0, 6).join(",")}` : null,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return audit;
}
