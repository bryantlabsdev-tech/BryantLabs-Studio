import { buildDeterministicAppFromManifest } from "@/core/greenfield/appStub";
import { validateDomainConsistency } from "@/core/greenfield/domainConsistency";
import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import { buildDeterministicSidebarFromManifest } from "@/core/greenfield/sidebarStub";
import { mergeProjectFiles } from "@/core/greenfield/parseProjectFile";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";

function allManifestPagesPresent(
  manifest: GreenfieldManifest,
  projectFiles: readonly GreenfieldProjectFile[],
): boolean {
  return manifest.pagePaths.every((path) =>
    projectFiles.some((f) => f.path === path && f.content.trim()),
  );
}

/**
 * Align App.tsx and Sidebar.tsx with the manifest when page files are complete.
 * Skips reconciliation when unexpected or missing page files exist (domain drift).
 */
export function reconcileIntegrationFromManifest(
  manifest: GreenfieldManifest,
  projectFiles: readonly GreenfieldProjectFile[],
  warnings: string[],
): GreenfieldProjectFile[] {
  if (!allManifestPagesPresent(manifest, projectFiles)) {
    return [...projectFiles];
  }

  const preCheck = validateDomainConsistency(manifest, projectFiles);
  if (
    preCheck.unexpectedPagePaths.length > 0 ||
    preCheck.missingPagePaths.length > 0 ||
    preCheck.typeExportMismatches.length > 0
  ) {
    return [...projectFiles];
  }

  let files = [...projectFiles];

  if (preCheck.appRouteMismatches.length > 0 && manifest.useRouter) {
    files = mergeProjectFiles(files, [
      buildDeterministicAppFromManifest(manifest, files),
    ]);
    warnings.push("Deterministic App.tsx reconciled to manifest pages");
  }

  const afterApp = validateDomainConsistency(manifest, files);
  if (afterApp.sidebarMismatches.length > 0) {
    files = mergeProjectFiles(files, [buildDeterministicSidebarFromManifest(manifest)]);
    warnings.push("Deterministic Sidebar.tsx reconciled to manifest pages");
  }

  return files;
}
