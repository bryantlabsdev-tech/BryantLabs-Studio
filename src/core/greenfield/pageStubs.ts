import type { GreenfieldPageSpec, GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";
import { mergeProjectFiles } from "@/core/greenfield/parseProjectFile";

function componentName(title: string): string {
  return title.replace(/\s+/g, "");
}

export function buildStubPageFile(
  page: GreenfieldPageSpec,
  manifest: GreenfieldManifest,
): GreenfieldProjectFile {
  const comp = componentName(page.title);
  const bodyClass = manifest.useTailwind
    ? 'className="p-6"'
    : 'style={{ padding: "1.5rem" }}';
  const titleClass = manifest.useTailwind
    ? 'className="text-2xl font-semibold text-white"'
    : 'style={{ fontSize: "1.5rem", fontWeight: 600 }}';
  const hintClass = manifest.useTailwind
    ? 'className="mt-2 text-sm text-neutral-400"'
    : 'style={{ marginTop: "0.5rem", opacity: 0.7 }}';

  return {
    path: page.path,
    content: `export default function ${comp}() {
  return (
    <div ${bodyClass}>
      <h1 ${titleClass}>${page.title}</h1>
      <p ${hintClass}>Page scaffold — generated to complete routing. Replace with full UI in a follow-up.</p>
    </div>
  );
}
`,
  };
}

export function fillMissingPageStubs(
  manifest: GreenfieldManifest,
  projectFiles: readonly GreenfieldProjectFile[],
): { files: GreenfieldProjectFile[]; stubbedPaths: string[] } {
  const stubbedPaths: string[] = [];
  let files = [...projectFiles];

  for (const page of manifest.pages) {
    const existing = files.find((f) => f.path === page.path);
    if (existing?.content.trim()) continue;
    files = mergeProjectFiles(files, [buildStubPageFile(page, manifest)]);
    stubbedPaths.push(page.path);
  }

  return { files, stubbedPaths };
}
