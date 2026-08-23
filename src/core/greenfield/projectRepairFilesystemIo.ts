import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

/** Node-only repair IO for benchmarks and stress harnesses (direct filesystem + shell typecheck). */
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
