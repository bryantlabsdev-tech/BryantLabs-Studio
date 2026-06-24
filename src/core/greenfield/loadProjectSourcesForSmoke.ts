import type { BryantLabsApi, FileNode } from "@/types";
import { smokeAppTypeLabel } from "@/core/greenfield/runtimeSmokeAppType";
import {
  runtimeSmokeFromProjectFiles,
  type RuntimeSmokeCheckStatus,
  type RuntimeSmokeResult,
} from "@/core/greenfield/runtimeSmokeVerification";

const SMOKE_FILE_PATTERN = /\.(tsx?|jsx?|html|json)$/;

function skipDir(name: string): boolean {
  return name === "node_modules" || name === ".git";
}

async function walkDirectory(
  api: BryantLabsApi,
  dirPath: string,
  relPrefix: string,
  out: { path: string; content: string }[],
): Promise<void> {
  let nodes: FileNode[];
  try {
    nodes = await api.listDirectory(dirPath);
  } catch {
    return;
  }
  for (const node of nodes) {
    if (skipDir(node.name)) continue;
    const rel = relPrefix ? `${relPrefix}/${node.name}` : node.name;
    if (node.type === "directory") {
      await walkDirectory(api, node.path, rel, out);
      continue;
    }
    if (!SMOKE_FILE_PATTERN.test(node.name)) continue;
    try {
      const read = await api.readFile(node.path);
      if (read.readable && read.content !== undefined) {
        out.push({ path: rel.replace(/\\/g, "/"), content: read.content });
      }
    } catch {
      /* skip unreadable */
    }
  }
}

/** Collect project sources for static runtime smoke checks (post-build). */
export async function loadProjectSourcesForSmoke(
  api: BryantLabsApi,
  projectRoot: string,
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  await walkDirectory(api, projectRoot, "", out);
  return out;
}

function smokeStatusIcon(status: RuntimeSmokeCheckStatus): string {
  switch (status) {
    case "passed":
      return "✓";
    case "failed":
      return "✗";
    case "advisory":
      return "⚠";
    case "skipped":
      return "—";
  }
}

export function formatRuntimeSmokeDetails(result: RuntimeSmokeResult): string {
  const header = [
    `App type: ${smokeAppTypeLabel(result.appType)}`,
    `Overall: ${result.overallStatus}`,
  ].join("\n");
  const lines = result.checks.map(
    (c) => `${smokeStatusIcon(c.status)} [${c.status}] ${c.label}: ${c.detail}`,
  );
  return `${header}\n${lines.join("\n")}`;
}

export async function evaluateProjectRuntimeSmoke(
  api: BryantLabsApi,
  projectRoot: string,
  options: { readonly prompt?: string } = {},
): Promise<RuntimeSmokeResult> {
  const files = await loadProjectSourcesForSmoke(api, projectRoot);
  return runtimeSmokeFromProjectFiles(files, options);
}
