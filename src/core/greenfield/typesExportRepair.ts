import type { GreenfieldProjectFile } from "@/core/greenfield/types";
import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import {
  extractExportedTypeNames,
  extractTypeImportsFromPage,
} from "@/core/greenfield/domainConsistency";

const LEGACY_FIELDFLOW_TYPES = ["Lead", "Job", "Estimate", "Invoice", "Customer"] as const;

function manifestHasPageForLegacyType(
  manifest: GreenfieldManifest,
  typeName: string,
): boolean {
  return manifest.pages.some((page) =>
    page.title.toLowerCase().startsWith(typeName.toLowerCase()),
  );
}

/** Remove stray FieldFlow CRM types when the manifest is a different app. */
export function stripLegacyFieldFlowTypes(
  typesContent: string,
  manifest: GreenfieldManifest,
): { content: string; removed: string[] } | null {
  let next = typesContent;
  const removed: string[] = [];

  for (const legacy of LEGACY_FIELDFLOW_TYPES) {
    if (manifestHasPageForLegacyType(manifest, legacy)) continue;
    const blockRe = new RegExp(
      `export\\s+(?:type|interface)\\s+${legacy}\\b[\\s\\S]*?\\n?\\}\\s*\\n?`,
      "g",
    );
    const before = next;
    next = next.replace(blockRe, "");
    if (next !== before) removed.push(legacy);
  }

  if (removed.length === 0) return null;
  return { content: next.trimEnd() + "\n", removed };
}

export function repairLegacyFieldFlowTypesInProject(
  projectFiles: readonly GreenfieldProjectFile[],
  manifest: GreenfieldManifest,
): { files: GreenfieldProjectFile[]; removed: readonly string[] } {
  const typesFile = projectFiles.find((f) => f.path === "src/types.ts");
  if (!typesFile) return { files: [...projectFiles], removed: [] };

  const stripped = stripLegacyFieldFlowTypes(typesFile.content, manifest);
  if (!stripped) return { files: [...projectFiles], removed: [] };

  const files = projectFiles.map((f) =>
    f.path === "src/types.ts" ? { ...f, content: stripped.content } : f,
  );
  return { files, removed: stripped.removed };
}

function readFile(
  projectFiles: readonly GreenfieldProjectFile[],
  path: string,
): string | null {
  return projectFiles.find((f) => f.path === path)?.content ?? null;
}

function pageFiles(
  projectFiles: readonly GreenfieldProjectFile[],
): GreenfieldProjectFile[] {
  return projectFiles.filter(
    (f) => f.path.startsWith("src/pages/") && f.path.endsWith(".tsx"),
  );
}

/** Collect type names imported from ../types that are not exported in src/types.ts. */
export function collectMissingTypeExportNames(
  projectFiles: readonly GreenfieldProjectFile[],
): string[] {
  const typesContent = readFile(projectFiles, "src/types.ts");
  if (!typesContent) return [];

  const exported = extractExportedTypeNames(typesContent);
  const missing = new Set<string>();

  for (const page of pageFiles(projectFiles)) {
    for (const typeName of extractTypeImportsFromPage(page.content)) {
      if (!exported.has(typeName)) missing.add(typeName);
    }
  }

  return [...missing];
}

/** Generate a safe stub export for a missing domain type. */
export function stubExportForTypeName(name: string): string {
  if (/Status$/.test(name) || /Type$/.test(name)) {
    return `export type ${name} = "Active" | "Inactive" | "Pending" | "Completed" | "Scheduled" | "Cancelled" | "Postponed" | "Draft" | "Open" | "Closed" | "Approved" | "Rejected" | "Paid" | "Overdue" | "General" | "Other";\n`;
  }
  if (name === "User") {
    return `export interface User {\n  id: string;\n  name: string;\n  email: string;\n  role: string;\n}\n`;
  }
  if (/Log$/.test(name)) {
    return `export interface ${name} {\n  id: string;\n  message: string;\n  createdAt: string;\n}\n`;
  }
  if (/Run$/.test(name)) {
    return `export interface ${name} {\n  id: string;\n  status: string;\n  amount: number;\n  createdAt: string;\n}\n`;
  }
  if (/Record$/.test(name)) {
    return `export interface ${name} {\n  id: string;\n  notes: string;\n  createdAt: string;\n}\n`;
  }
  return `export interface ${name} {\n  id: string;\n  name: string;\n}\n`;
}

export function repairMissingTypeExports(
  projectFiles: readonly GreenfieldProjectFile[],
): { files: GreenfieldProjectFile[]; repaired: readonly string[] } {
  const missing = collectMissingTypeExportNames(projectFiles);
  if (missing.length === 0) {
    return { files: [...projectFiles], repaired: [] };
  }

  const typesIdx = projectFiles.findIndex((f) => f.path === "src/types.ts");
  const existing =
    typesIdx >= 0 ? projectFiles[typesIdx]!.content : "// Auto-generated domain types\n";
  const exported = extractExportedTypeNames(existing);

  const stubs: string[] = [];
  for (const name of missing) {
    if (exported.has(name)) continue;
    stubs.push(stubExportForTypeName(name));
    exported.add(name);
  }

  if (stubs.length === 0) {
    return { files: [...projectFiles], repaired: [] };
  }

  const separator = existing.trimEnd().endsWith("\n") ? "\n" : "\n\n";
  const patchedTypes = `${existing.trimEnd()}${separator}// Auto-patched missing exports\n${stubs.join("\n")}`;

  const files = projectFiles.map((f) =>
    f.path === "src/types.ts" ? { ...f, content: patchedTypes } : f,
  );

  if (typesIdx < 0) {
    files.push({ path: "src/types.ts", content: patchedTypes });
  }

  return { files, repaired: missing };
}
