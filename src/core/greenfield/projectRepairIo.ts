import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BryantLabsApi } from "@/types";
import type { ProjectRepairIO, ProjectTypecheckRun } from "@/core/greenfield/projectRepairTypes";

async function runShellTypecheck(cwd: string): Promise<ProjectTypecheckRun> {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn("npx tsc --noEmit", {
      cwd,
      shell: true,
      env: { ...process.env, CI: "1" },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 300_000);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - started),
        timedOut,
      });
    });
  });
}

function projectAbsPath(projectRoot: string, relPath: string): string {
  return join(projectRoot.replace(/\/$/, ""), relPath);
}

async function loadFilesystemSourceMap(projectRoot: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  async function walk(rel: string): Promise<void> {
    const abs = join(projectRoot, rel);
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(childRel);
        continue;
      }
      if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
      try {
        const content = await readFile(join(projectRoot, childRel), "utf8");
        map.set(childRel.replace(/\\/g, "/"), content);
      } catch {
        // skip unreadable
      }
    }
  }
  await walk("");
  return map;
}

export function createFilesystemProjectRepairIo(projectRoot: string): ProjectRepairIO {
  const root = projectRoot.replace(/\/$/, "");
  return {
    readFile: async (relPath) => {
      try {
        return await readFile(join(root, relPath), "utf8");
      } catch {
        return null;
      }
    },
    writeFile: async (relPath, content) => {
      const abs = join(root, relPath);
      await mkdir(join(abs, ".."), { recursive: true });
      await writeFile(abs, content, "utf8");
    },
    loadSourceMap: () => loadFilesystemSourceMap(root),
    runTypecheck: () => runShellTypecheck(root),
  };
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
