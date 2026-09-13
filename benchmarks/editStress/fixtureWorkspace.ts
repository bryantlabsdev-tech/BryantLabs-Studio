import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mockProjectScan } from "@/core/repository/testScan";
import type { ProjectScan, VerificationResult } from "@/types";
import { editStressFixtureById } from "./fixtures";

const execFileAsync = promisify(execFile);

const DISK_SOURCES: Readonly<Record<string, string>> = {
  "sudoku-vite": "e2e/fixtures/sudoku-vite",
};

const MINIMAL_PACKAGE_JSON = {
  name: "edit-stress-fixture",
  private: true,
  version: "0.0.0",
  type: "module",
  scripts: {
    dev: "vite",
    build: "tsc -p tsconfig.json --noEmit && vite build",
    typecheck: "tsc -p tsconfig.json --noEmit",
  },
  dependencies: {
    react: "^19.2.7",
    "react-dom": "^19.2.7",
  },
  devDependencies: {
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.2",
    typescript: "^6.0.3",
    vite: "^8.0.16",
  },
};

const MINIMAL_TSCONFIG = {
  compilerOptions: {
    target: "ES2020",
    lib: ["ES2020", "DOM", "DOM.Iterable"],
    module: "ESNext",
    skipLibCheck: true,
    moduleResolution: "bundler",
    isolatedModules: true,
    noEmit: true,
    jsx: "react-jsx",
    strict: true,
  },
  include: ["src", "vite.config.ts"],
};

const MINIMAL_VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()] });`;

function stubComponent(name: string): string {
  return `export default function ${name}() {
  return <main>${name}</main>;
}
`;
}

async function writeSyntheticTree(root: string, files: readonly string[]): Promise<void> {
  for (const rel of files) {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    if (rel === "package.json") {
      await writeFile(abs, `${JSON.stringify(MINIMAL_PACKAGE_JSON, null, 2)}\n`);
    } else if (rel === "tsconfig.json") {
      await writeFile(abs, `${JSON.stringify(MINIMAL_TSCONFIG, null, 2)}\n`);
    } else if (rel === "vite.config.ts") {
      await writeFile(abs, `${MINIMAL_VITE_CONFIG}\n`);
    } else if (rel === "index.html") {
      await writeFile(
        abs,
        `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
      );
    } else if (rel === "src/main.tsx") {
      await writeFile(
        abs,
        `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
`,
      );
    } else if (rel === "src/App.tsx") {
      await writeFile(abs, stubComponent("App"));
    } else if (rel === "src/index.css") {
      await writeFile(abs, "body { margin: 0; }\n");
    } else if (rel.endsWith(".tsx")) {
      const base = rel.split("/").pop()!.replace(".tsx", "");
      await writeFile(abs, stubComponent(base));
    } else if (rel.endsWith(".ts")) {
      await writeFile(abs, `export const mock = true;\n`);
    } else {
      await writeFile(abs, `// ${rel}\n`);
    }
  }
}

export interface FixtureWorkspace {
  readonly root: string;
  readonly scan: ProjectScan;
  readonly verifyCapable: boolean;
}

const ROOT_MANIFEST_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
] as const;

async function listSourceFiles(root: string, dirRel: string): Promise<string[]> {
  const absDir = path.join(root, dirRel);
  if (!existsSync(absDir)) return [];
  const out: string[] = [];
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.posix.join(dirRel.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(root, rel)));
    } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

export async function listProjectWorkspaceFiles(root: string): Promise<string[]> {
  const resolved = path.resolve(root);
  const files: string[] = [];
  for (const rel of ROOT_MANIFEST_FILES) {
    if (existsSync(path.join(resolved, rel))) files.push(rel);
  }
  files.push(...(await listSourceFiles(resolved, "src")));
  return [...new Set(files)];
}

/** Open an on-disk Studio project for headless edit stress (in-place writes). */
export async function openProjectWorkspace(projectRoot: string): Promise<FixtureWorkspace> {
  const root = path.resolve(projectRoot);
  if (!existsSync(root)) {
    throw new Error(`Project not found: ${root}`);
  }
  const files = await listProjectWorkspaceFiles(root);
  if (files.length === 0) {
    throw new Error(`No project files found under: ${root}`);
  }
  const scan = mockProjectScan(files, { root });
  return {
    root,
    scan,
    verifyCapable: existsSync(path.join(root, "package.json")),
  };
}

export async function materializeEditStressFixture(
  fixtureId: string,
  promptId?: string,
): Promise<FixtureWorkspace> {
  const fixture = editStressFixtureById(fixtureId);
  if (!fixture) {
    throw new Error(`Unknown fixture: ${fixtureId}`);
  }
  const suffix = promptId ? `-${promptId}` : "";
  const root = path.join(
    tmpdir(),
    `bryantlabs-edit-stress-${fixtureId}${suffix}-${process.pid}`,
  );
  await mkdir(root, { recursive: true });

  const diskSource = DISK_SOURCES[fixtureId];
  if (diskSource) {
    await cp(path.join(process.cwd(), diskSource), root, { recursive: true });
    const missing = fixture.files.filter(
      (rel) => !existsSync(path.join(root, rel)),
    );
    if (missing.length > 0) {
      await writeSyntheticTree(root, missing);
    }
  } else {
    await writeSyntheticTree(root, fixture.files);
  }

  const scan = mockProjectScan([...fixture.files], { root });
  return { root, scan, verifyCapable: true };
}

export async function installFixtureDeps(workspace: FixtureWorkspace): Promise<void> {
  await execFileAsync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: workspace.root,
    timeout: 180_000,
  });
}

const sharedDepsRoots = new Map<string, Promise<string>>();

/** Install fixture deps once per process and symlink node_modules into each workspace. */
export async function linkFixtureDeps(
  fixtureId: string,
  workspace: FixtureWorkspace,
): Promise<void> {
  let pending = sharedDepsRoots.get(fixtureId);
  if (!pending) {
    pending = (async () => {
      const depsRoot = path.join(
        tmpdir(),
        `bryantlabs-fixture-deps-${fixtureId}-${process.pid}`,
      );
      await mkdir(depsRoot, { recursive: true });
      const diskSource = DISK_SOURCES[fixtureId];
      if (diskSource) {
        const sourceRoot = path.join(process.cwd(), diskSource);
        await cp(path.join(sourceRoot, "package.json"), path.join(depsRoot, "package.json"));
        const lockPath = path.join(sourceRoot, "package-lock.json");
        if (existsSync(lockPath)) {
          await cp(lockPath, path.join(depsRoot, "package-lock.json"));
        }
      } else {
        await writeFile(
          path.join(depsRoot, "package.json"),
          `${JSON.stringify(MINIMAL_PACKAGE_JSON, null, 2)}\n`,
        );
      }
      await execFileAsync("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: depsRoot,
        timeout: 180_000,
      });
      return depsRoot;
    })();
    sharedDepsRoots.set(fixtureId, pending);
  }

  const depsRoot = await pending;
  const linkTarget = path.join(workspace.root, "node_modules");
  if (!existsSync(linkTarget)) {
    await symlink(
      path.join(depsRoot, "node_modules"),
      linkTarget,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
}

export async function readWorkspaceFile(absPath: string): Promise<string> {
  return readFile(absPath, "utf8");
}

export async function writeWorkspaceFile(absPath: string, content: string): Promise<void> {
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function runCommand(
  cwd: string,
  command: string,
  args: string[],
): Promise<{
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}> {
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return {
      ok: true,
      exitCode: 0,
      stdout,
      stderr,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      ok: false,
      exitCode: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      durationMs: Date.now() - started,
    };
  }
}

export async function verifyFixtureWorkspace(
  workspace: FixtureWorkspace,
): Promise<VerificationResult> {
  const typecheck = await runCommand(workspace.root, "npm", ["run", "typecheck"]);
  const build = await runCommand(workspace.root, "npm", ["run", "build"]);
  return {
    typecheck: {
      command: "npm run typecheck",
      ok: typecheck.ok,
      exitCode: typecheck.exitCode,
      stdout: typecheck.stdout,
      stderr: typecheck.stderr,
      durationMs: typecheck.durationMs,
      errorCount: typecheck.ok ? 0 : 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
    build: {
      command: "npm run build",
      ok: build.ok,
      exitCode: build.exitCode,
      stdout: build.stdout,
      stderr: build.stderr,
      durationMs: build.durationMs,
      errorCount: build.ok ? 0 : 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
    ranAt: Date.now(),
  };
}
