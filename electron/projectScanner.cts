import * as path from "node:path";
import { promises as fs } from "node:fs";
import { indexFile, isIndexable, type FileIndex } from "./codeIndexer.cjs";

/**
 * Read-only project scanner.
 *
 * Walks the project tree (skipping heavy/generated directories), counts files
 * and folders, detects common config files and frameworks, and builds a
 * lightweight code index. It only reads — never writes, deletes, or executes.
 */

/** Directories excluded from scanning, counts, and indexing. */
export const SCAN_IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".bryantlabs",
  ".hg",
  ".svn",
  "dist",
  "dist-electron",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".vite",
]);

const IGNORED_DIRS = SCAN_IGNORED_DIR_NAMES;

/** Largest source file we will read for indexing (bytes). */
export const MAX_INDEX_BYTES = 512 * 1024;

/** True when a project-relative path sits under an ignored directory. */
export function isIgnoredProjectPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  for (const segment of normalized.split("/")) {
    if (SCAN_IGNORED_DIR_NAMES.has(segment)) return true;
  }
  return false;
}

export interface ProjectDetections {
  packageJson: boolean;
  tsconfig: boolean;
  viteConfig: boolean;
  electron: boolean;
  react: boolean;
  nextjs: boolean;
  node: boolean;
}

export type PackageDependencyKind =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies";

export interface PackageDependency {
  name: string;
  version: string;
  kind: PackageDependencyKind;
}

export interface ProjectSummary {
  name: string;
  framework: string;
  language: string;
  bundler: string;
  totalFiles: number;
  totalFolders: number;
  entryPoints: string[];
  packageManager: string;
  detections: ProjectDetections;
}

export interface FileEntry {
  path: string;
  absPath: string;
}

export type SymbolKind =
  | "component"
  | "function"
  | "export"
  | "hook"
  | "class"
  | "interface"
  | "type";

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  path: string;
  absPath: string;
  line: number | null;
}

export interface SymbolGraphNode {
  name: string;
  kind: SymbolKind;
  definedIn: string;
  absPath: string;
  /** Project-relative paths that reference this symbol. */
  referencedBy: string[];
}

export interface RepositoryStats {
  totalFiles: number;
  totalComponents: number;
  totalFunctions: number;
  totalHooks: number;
  totalClasses: number;
  totalInterfaces: number;
  totalTypes: number;
  totalImports: number;
  totalExports: number;
}

export interface ProjectScan {
  summary: ProjectSummary;
  files: FileEntry[];
  index: FileIndex[];
  symbols: SymbolEntry[];
  symbolGraph: SymbolGraphNode[];
  repositoryStats: RepositoryStats;
  dependencies: PackageDependency[];
  repositorySummary: string;
  scannedAt: number;
}

interface WalkAccumulator {
  files: FileEntry[];
  index: FileIndex[];
  fileCount: number;
  folderCount: number;
  tsFileCount: number;
  jsFileCount: number;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function firstExisting(
  root: string,
  candidates: string[],
): Promise<string | null> {
  for (const candidate of candidates) {
    if (await exists(path.join(root, candidate))) return candidate;
  }
  return null;
}

async function readPackageJson(
  root: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function dependencyNames(pkg: Record<string, unknown> | null): Set<string> {
  const names = new Set<string>();
  if (!pkg) return names;
  for (const dep of extractPackageDependencies(pkg)) {
    names.add(dep.name);
  }
  return names;
}

function extractPackageDependencies(
  pkg: Record<string, unknown> | null,
): PackageDependency[] {
  const out: PackageDependency[] = [];
  if (!pkg) return out;
  for (const kind of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ] as const) {
    const group = pkg[kind];
    if (!group || typeof group !== "object") continue;
    for (const [name, version] of Object.entries(
      group as Record<string, unknown>,
    )) {
      if (typeof version !== "string") continue;
      out.push({ name, version, kind });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function detectBundler(
  root: string,
  detections: ProjectDetections,
  deps: PackageDependency[],
): Promise<string> {
  if (detections.nextjs) return "Next.js";
  if (detections.viteConfig) return "Vite";
  const webpack = await firstExisting(root, [
    "webpack.config.js",
    "webpack.config.ts",
    "webpack.config.cjs",
    "webpack.config.mjs",
  ]);
  if (webpack) return "Webpack";
  const rollup = await firstExisting(root, [
    "rollup.config.js",
    "rollup.config.ts",
    "rollup.config.mjs",
  ]);
  if (rollup) return "Rollup";
  const parcel = await firstExisting(root, [".parcelrc"]);
  if (parcel) return "Parcel";
  const depNames = new Set(deps.map((d) => d.name));
  if (depNames.has("esbuild")) return "esbuild";
  if (depNames.has("turbo")) return "Turborepo";
  if (detections.electron && !detections.react) return "Electron (main)";
  return "unknown";
}

function buildRepositorySummaryText(
  summary: ProjectSummary,
  stats: RepositoryStats,
  dependencies: PackageDependency[],
): string {
  const depNames = dependencies
    .filter((d) => d.kind === "dependencies")
    .slice(0, 16)
    .map((d) => d.name);
  const devNames = dependencies
    .filter((d) => d.kind === "devDependencies")
    .slice(0, 8)
    .map((d) => d.name);
  const lines = [
    `Project: ${summary.name}`,
    `Framework: ${summary.framework}`,
    `Language: ${summary.language}`,
    `Bundler: ${summary.bundler}`,
    `Package manager: ${summary.packageManager}`,
    `Files: ${summary.totalFiles} total · ${stats.totalFiles} indexed source files`,
    `Components: ${stats.totalComponents} · Functions: ${stats.totalFunctions} · Hooks: ${stats.totalHooks}`,
  ];
  if (summary.entryPoints.length > 0) {
    lines.push(`Entry points: ${summary.entryPoints.join(", ")}`);
  }
  if (depNames.length > 0) {
    lines.push(`Dependencies: ${depNames.join(", ")}`);
  }
  if (devNames.length > 0) {
    lines.push(`Dev dependencies: ${devNames.join(", ")}`);
  }
  return lines.join("\n");
}

async function walk(
  dir: string,
  root: string,
  acc: WalkAccumulator,
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      acc.folderCount += 1;
      await walk(abs, root, acc);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name === ".DS_Store") continue;

    const rel = path.relative(root, abs);
    acc.fileCount += 1;
    acc.files.push({ path: rel, absPath: abs });

    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".ts" || ext === ".tsx" || ext === ".cts" || ext === ".mts") {
      acc.tsFileCount += 1;
    } else if (
      ext === ".js" ||
      ext === ".jsx" ||
      ext === ".cjs" ||
      ext === ".mjs"
    ) {
      acc.jsFileCount += 1;
    }

    if (isIndexable(ext)) {
      try {
        const stat = await fs.stat(abs);
        if (stat.size <= MAX_INDEX_BYTES) {
          const buffer = await fs.readFile(abs);
          if (!buffer.includes(0)) {
            acc.index.push(indexFile(rel, ext, buffer.toString("utf8")));
          }
        }
      } catch {
        // Unreadable file — skip indexing, keep it counted.
      }
    }
  }
}

function pushSymbol(
  symbols: SymbolEntry[],
  seen: Set<string>,
  name: string,
  kind: SymbolKind,
  path: string,
  absPath: string,
  line: number | null,
): void {
  const key = `${path}::${kind}::${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  symbols.push({ name, kind, path, absPath, line });
}

export function buildSymbols(index: FileIndex[], files: FileEntry[]): SymbolEntry[] {
  const absByRel = new Map(files.map((f) => [f.path, f.absPath]));
  const symbols: SymbolEntry[] = [];
  const seen = new Set<string>();

  for (const file of index) {
    const absPath = absByRel.get(file.path) ?? file.path;
    const locations = file.symbolLocations ?? [];
    if (locations.length > 0) {
      for (const loc of locations) {
        pushSymbol(
          symbols,
          seen,
          loc.name,
          loc.kind as SymbolKind,
          file.path,
          absPath,
          loc.line,
        );
      }
      continue;
    }
    for (const name of file.components) {
      pushSymbol(symbols, seen, name, "component", file.path, absPath, null);
    }
    for (const name of file.functions) {
      pushSymbol(symbols, seen, name, "function", file.path, absPath, null);
    }
    for (const name of file.hooks) {
      pushSymbol(symbols, seen, name, "hook", file.path, absPath, null);
    }
    for (const name of file.classes) {
      pushSymbol(symbols, seen, name, "class", file.path, absPath, null);
    }
    for (const name of file.interfaces) {
      pushSymbol(symbols, seen, name, "interface", file.path, absPath, null);
    }
    for (const name of file.types) {
      pushSymbol(symbols, seen, name, "type", file.path, absPath, null);
    }
    for (const name of file.exports) {
      pushSymbol(symbols, seen, name, "export", file.path, absPath, null);
    }
  }
  return symbols;
}

export function buildSymbolGraph(
  index: FileIndex[],
  symbols: SymbolEntry[],
  files: FileEntry[],
): SymbolGraphNode[] {
  const absByRel = new Map(files.map((f) => [f.path, f.absPath]));
  const refsByConsumer = new Map(
    index.map((f) => [f.path, new Set(f.referencedNames)]),
  );

  const byName = new Map<string, SymbolEntry[]>();
  for (const sym of symbols) {
    if (sym.name === "default") continue;
    const list = byName.get(sym.name) ?? [];
    list.push(sym);
    byName.set(sym.name, list);
  }

  const graph: SymbolGraphNode[] = [];

  for (const sym of symbols) {
    if (sym.name === "default") continue;
    const referencedBy: string[] = [];
    for (const file of index) {
      if (file.path === sym.path) continue;
      const refs = refsByConsumer.get(file.path);
      if (refs?.has(sym.name)) referencedBy.push(file.path);
    }
    referencedBy.sort((a, b) => a.localeCompare(b));
    graph.push({
      name: sym.name,
      kind: sym.kind,
      definedIn: sym.path,
      absPath: absByRel.get(sym.path) ?? sym.path,
      referencedBy,
    });
  }

  return graph;
}

export function buildRepositoryStats(index: FileIndex[]): RepositoryStats {
  let totalImports = 0;
  let totalExports = 0;
  let totalComponents = 0;
  let totalFunctions = 0;
  let totalHooks = 0;
  let totalClasses = 0;
  let totalInterfaces = 0;
  let totalTypes = 0;

  for (const file of index) {
    totalImports += file.imports.length;
    totalExports += file.exports.length;
    totalComponents += file.components.length;
    totalFunctions += file.functions.length;
    totalHooks += file.hooks.length;
    totalClasses += file.classes.length;
    totalInterfaces += file.interfaces.length;
    totalTypes += file.types.length;
  }

  return {
    totalFiles: index.length,
    totalComponents,
    totalFunctions,
    totalHooks,
    totalClasses,
    totalInterfaces,
    totalTypes,
    totalImports,
    totalExports,
  };
}

function detectPackageManager(root: string, lockfiles: {
  pnpm: boolean;
  yarn: boolean;
  bun: boolean;
  npm: boolean;
}, pkg: Record<string, unknown> | null): string {
  void root;
  if (lockfiles.pnpm) return "pnpm";
  if (lockfiles.yarn) return "yarn";
  if (lockfiles.bun) return "bun";
  if (lockfiles.npm) return "npm";
  const declared = pkg?.["packageManager"];
  if (typeof declared === "string" && declared.length > 0) {
    return declared.split("@")[0] ?? "unknown";
  }
  return "unknown";
}

function buildFrameworkLabel(d: ProjectDetections): string {
  let label: string;
  if (d.nextjs) {
    label = "Next.js";
  } else if (d.electron && d.react) {
    label = "Electron + React";
  } else if (d.electron) {
    label = "Electron";
  } else if (d.react) {
    label = "React";
  } else if (d.node) {
    label = "Node.js";
  } else {
    label = "Unknown";
  }
  if (d.viteConfig && !d.nextjs) {
    label += " (Vite)";
  }
  return label;
}

/** Index one file for incremental scan updates. */
export async function indexSingleProjectFile(
  root: string,
  relPath: string,
): Promise<{ file: FileEntry; index: FileIndex | null } | null> {
  if (isIgnoredProjectPath(relPath)) return null;
  const absPath = path.join(root, relPath);
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) return null;
    const file: FileEntry = { path: relPath, absPath };
    const ext = path.extname(relPath).toLowerCase();
    if (!isIndexable(ext) || stat.size > MAX_INDEX_BYTES) {
      return { file, index: null };
    }
    const buffer = await fs.readFile(absPath);
    if (buffer.includes(0)) {
      return { file, index: null };
    }
    return { file, index: indexFile(relPath, ext, buffer.toString("utf8")) };
  } catch {
    return null;
  }
}

/** Rebuild derived scan fields after incremental file/index mutations. */
export function recomputeProjectScanDerived(scan: ProjectScan): ProjectScan {
  const symbols = buildSymbols(scan.index, scan.files);
  return {
    ...scan,
    symbols,
    symbolGraph: buildSymbolGraph(scan.index, symbols, scan.files),
    repositoryStats: buildRepositoryStats(scan.index),
    scannedAt: Date.now(),
  };
}

export async function scanProject(root: string): Promise<ProjectScan> {
  const acc: WalkAccumulator = {
    files: [],
    index: [],
    fileCount: 0,
    folderCount: 0,
    tsFileCount: 0,
    jsFileCount: 0,
  };

  const pkg = await readPackageJson(root);
  const deps = dependencyNames(pkg);

  const [
    hasPackageJson,
    tsconfig,
    viteConfig,
    nextConfig,
    electronDir,
    pnpmLock,
    yarnLock,
    bunLock,
    npmLock,
  ] = await Promise.all([
    exists(path.join(root, "package.json")),
    exists(path.join(root, "tsconfig.json")),
    firstExisting(root, [
      "vite.config.ts",
      "vite.config.js",
      "vite.config.mjs",
      "vite.config.cjs",
      "vite.config.mts",
      "vite.config.cts",
    ]),
    firstExisting(root, [
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
    ]),
    exists(path.join(root, "electron")),
    exists(path.join(root, "pnpm-lock.yaml")),
    exists(path.join(root, "yarn.lock")),
    exists(path.join(root, "bun.lockb")),
    exists(path.join(root, "package-lock.json")),
  ]);

  await walk(root, root, acc);

  const detections: ProjectDetections = {
    packageJson: hasPackageJson,
    tsconfig,
    viteConfig: viteConfig !== null,
    electron: deps.has("electron") || electronDir,
    react: deps.has("react"),
    nextjs: deps.has("next") || nextConfig !== null,
    node: hasPackageJson,
  };

  const language =
    detections.tsconfig || acc.tsFileCount > 0
      ? "TypeScript"
      : acc.jsFileCount > 0
        ? "JavaScript"
        : "Unknown";

  const entryCandidates = [
    typeof pkg?.["main"] === "string" ? (pkg["main"] as string) : null,
    "src/main.tsx",
    "src/main.ts",
    "src/index.tsx",
    "src/index.ts",
    "src/index.jsx",
    "src/index.js",
    "index.html",
    "app/page.tsx",
    "pages/index.tsx",
  ].filter((c): c is string => Boolean(c));

  const entryPoints: string[] = [];
  for (const candidate of entryCandidates) {
    if (await exists(path.join(root, candidate))) {
      if (!entryPoints.includes(candidate)) entryPoints.push(candidate);
    }
  }

  const name =
    typeof pkg?.["name"] === "string" && (pkg["name"] as string).length > 0
      ? (pkg["name"] as string)
      : path.basename(root);

  const dependencies = extractPackageDependencies(pkg);
  const bundler = await detectBundler(root, detections, dependencies);

  const summary: ProjectSummary = {
    name,
    framework: buildFrameworkLabel(detections),
    language,
    bundler,
    totalFiles: acc.fileCount,
    totalFolders: acc.folderCount,
    entryPoints,
    packageManager: detectPackageManager(
      root,
      { pnpm: pnpmLock, yarn: yarnLock, bun: bunLock, npm: npmLock },
      pkg,
    ),
    detections,
  };

  const symbols = buildSymbols(acc.index, acc.files);
  const repositoryStats = buildRepositoryStats(acc.index);

  return {
    summary,
    files: acc.files,
    index: acc.index,
    symbols,
    symbolGraph: buildSymbolGraph(acc.index, symbols, acc.files),
    repositoryStats,
    dependencies,
    repositorySummary: buildRepositorySummaryText(
      summary,
      repositoryStats,
      dependencies,
    ),
    scannedAt: Date.now(),
  };
}
