import type { PackageDependency, ProjectScan } from "@/types";

const MAX_DEPS_IN_SUMMARY = 24;

function topDependencyNames(deps: readonly PackageDependency[]): string[] {
  const order = ["dependencies", "devDependencies", "peerDependencies"] as const;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const kind of order) {
    for (const d of deps) {
      if (d.kind !== kind || seen.has(d.name)) continue;
      seen.add(d.name);
      out.push(d.name);
      if (out.length >= MAX_DEPS_IN_SUMMARY) return out;
    }
  }
  return out;
}

/** Compact narrative summary for agents and the Repository tab. */
export function buildRepositorySummary(scan: ProjectScan): string {
  const s = scan.summary;
  const stats = scan.repositoryStats;
  const depNames = topDependencyNames(scan.dependencies ?? []);
  const lines = [
    `Project: ${s.name}`,
    `Framework: ${s.framework}`,
    `Language: ${s.language}`,
    `Bundler: ${s.bundler ?? "unknown"}`,
    `Package manager: ${s.packageManager}`,
    `Files: ${s.totalFiles} total · ${stats.totalFiles} indexed source files`,
    `Components: ${stats.totalComponents} · Functions: ${stats.totalFunctions} · Hooks: ${stats.totalHooks}`,
  ];
  if (s.entryPoints.length > 0) {
    lines.push(`Entry points: ${s.entryPoints.join(", ")}`);
  }
  if (depNames.length > 0) {
    lines.push(`Key dependencies: ${depNames.join(", ")}`);
  }
  return lines.join("\n");
}
