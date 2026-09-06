import type { BryantLabsApi } from "@/types";
import type { ProjectRepairIO } from "@/core/greenfield/projectRepairTypes";

function projectAbsPath(projectRoot: string, relPath: string): string {
  return `${projectRoot.replace(/\/$/, "")}/${relPath}`;
}

async function loadApiSourceMap(api: BryantLabsApi, projectRoot: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const root = projectRoot.replace(/\/$/, "");

  async function walk(absDir: string, relPrefix: string): Promise<void> {
    let nodes;
    try {
      nodes = await api.listDirectory(absDir);
    } catch {
      return;
    }
    for (const node of nodes) {
      if (node.name === "node_modules" || node.name === ".git" || node.name === "dist") {
        continue;
      }
      const rel = relPrefix ? `${relPrefix}/${node.name}` : node.name;
      if (node.type === "directory") {
        await walk(node.path, rel);
        continue;
      }
      if (!/\.(tsx?|jsx?)$/.test(node.name)) continue;
      try {
        const res = await api.readFile(node.path);
        if (res.readable && res.content !== undefined) {
          map.set(rel.replace(/\\/g, "/"), res.content);
        }
      } catch {
        // skip
      }
    }
  }

  await walk(root, "");
  return map;
}

async function writeApiProjectFile(
  api: BryantLabsApi,
  projectRoot: string,
  relPath: string,
  content: string,
): Promise<void> {
  const abs = projectAbsPath(projectRoot, relPath);
  const existing = await api.readFile(abs);
  if (existing.readable && existing.content !== undefined) {
    const edit = await api.applyEdit(abs, existing.content, content);
    if (!edit.ok) {
      throw new Error(edit.reason ?? `Failed to write ${relPath}`);
    }
    return;
  }
  const created = await api.createProjectFile(abs, content);
  if (!created.ok) {
    throw new Error(created.reason ?? `Failed to create ${relPath}`);
  }
}

export function createApiProjectRepairIo(
  api: BryantLabsApi,
  projectRoot: string,
): ProjectRepairIO {
  return {
    readFile: async (relPath) => {
      const abs = projectAbsPath(projectRoot, relPath);
      try {
        const res = await api.readFile(abs);
        return res.readable && res.content !== undefined ? res.content : null;
      } catch {
        return null;
      }
    },
    writeFile: (relPath, content) => writeApiProjectFile(api, projectRoot, relPath, content),
    loadSourceMap: () => loadApiSourceMap(api, projectRoot),
    runTypecheck: async () => {
      const res = await api.greenfieldTypecheck(projectRoot);
      if ("error" in res) {
        return {
          exitCode: 2,
          stdout: "",
          stderr: res.error,
          durationMs: 0,
          timedOut: false,
        };
      }
      return {
        exitCode: res.typecheck.exitCode,
        stdout: res.typecheck.stdout,
        stderr: res.typecheck.stderr,
        durationMs: res.typecheck.durationMs,
        timedOut: res.typecheck.timedOut,
      };
    },
  };
}
