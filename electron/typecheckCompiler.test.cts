import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { runTypecheckOnly } from "./verifier.cjs";
import {
  TYPECHECK_COMPILER_UNAVAILABLE_MESSAGE,
  compilerChildEnv,
  resolveProjectTypeScriptCompiler,
  runProjectTypecheck,
} from "./typecheckCompiler.cjs";

const repoTypescript = path.join(process.cwd(), "node_modules", "typescript");
const plantedMath = `export function add(a: number, b: number): number {
  return a + b;
}

export const PLANTED_ERROR: number = "not-a-number";
`;
const cleanMath = `export function add(a: number, b: number): number {
  return a + b;
}
`;
const tsconfig = JSON.stringify(
  {
    compilerOptions: {
      strict: true,
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      skipLibCheck: true,
      noEmit: true,
    },
    files: ["src/math.ts"],
  },
  null,
  2,
);

const tempDirs: string[] = [];

async function makeTemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function installLocalTypeScript(project: string): Promise<void> {
  await mkdir(path.join(project, "node_modules"), { recursive: true });
  await cp(repoTypescript, path.join(project, "node_modules", "typescript"), {
    recursive: true,
    dereference: true,
  });
}

async function writeMathProject(project: string, source: string): Promise<void> {
  await mkdir(path.join(project, "src"), { recursive: true });
  await writeFile(path.join(project, "src", "math.ts"), source, "utf8");
  await writeFile(path.join(project, "tsconfig.json"), `${tsconfig}\n`, "utf8");
}

describe("project typecheck compiler", () => {
  after(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("reports unavailable and does not run npx when no local compiler exists", async () => {
    const root = await makeTemp("bl-tsc-missing-");
    const trap = path.join(root, "trap");
    const marker = path.join(root, "npx-was-invoked");
    await mkdir(trap);
    await writeFile(
      path.join(trap, "npx"),
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`,
      "utf8",
    );
    await chmod(path.join(trap, "npx"), 0o755);
    const previousPath = process.env.PATH;
    process.env.PATH = `${trap}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await runTypecheckOnly(root);
      assert.equal(result.unavailableTool, true);
      assert.equal(result.ok, false);
      assert.equal(result.exitCode, null);
      assert.equal(result.command, "tsc --noEmit");
      assert.equal(result.command.includes("npx"), false);
      assert.equal(result.stderr, TYPECHECK_COMPILER_UNAVAILABLE_MESSAGE);
      assert.equal(await readFile(marker, "utf8").then(() => true, () => false), false);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it("rejects a TypeScript package whose real path leaves the project", async () => {
    const root = await makeTemp("bl-tsc-escape-");
    const outside = await makeTemp("bl-tsc-outside-");
    await installLocalTypeScript(outside);
    await mkdir(path.join(root, "node_modules"));
    await symlink(
      path.join(outside, "node_modules", "typescript"),
      path.join(root, "node_modules", "typescript"),
    );
    assert.equal(resolveProjectTypeScriptCompiler(root), null);
    const result = await runProjectTypecheck(root, 30_000);
    assert.equal(result.unavailableTool, true);
    assert.equal(result.stderr, TYPECHECK_COMPILER_UNAVAILABLE_MESSAGE);
  });

  it("selects the project-local bin and reports the planted diagnostic", async () => {
    const root = await makeTemp("bl-tsc-local-");
    await installLocalTypeScript(root);
    await mkdir(path.join(root, "node_modules", ".bin"));
    await symlink(
      path.join("..", "typescript", "bin", "tsc"),
      path.join(root, "node_modules", ".bin", "tsc"),
    );
    await writeMathProject(root, plantedMath);
    const resolved = resolveProjectTypeScriptCompiler(root);
    assert.ok(resolved);
    assert.equal(resolved.kind, "project-local");
    assert.equal(resolved.executable, process.execPath);
    assert.equal(
      resolved.scriptPath.endsWith(`${path.sep}typescript${path.sep}lib${path.sep}tsc.js`),
      true,
    );
    assert.deepEqual(resolved.args, ["--noEmit", "--pretty", "false"]);
    const result = await runProjectTypecheck(root, 60_000);
    assert.equal(result.unavailableTool, false);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 2);
    assert.equal(result.command.includes("npx"), false);
    assert.match(
      result.stdout,
      /src\/math\.ts\(\d+,\d+\): error TS2322: Type 'string' is not assignable to type 'number'\./,
    );
    assert.ok(result.errorCount >= 1);
  });

  it("does not execute bin/tsc when lib/tsc.js points outside the project", async () => {
    const root = await makeTemp("bl-tsc-lib-escape-");
    const marker = path.join(root, "lib-escape-ran");
    const evil = path.join(root, "evil.js");
    await writeFile(
      evil,
      `require("fs").writeFileSync(${JSON.stringify(marker)}, "ran");\nprocess.exit(0);\n`,
      "utf8",
    );
    await installLocalTypeScript(root);
    const libTsc = path.join(root, "node_modules", "typescript", "lib", "tsc.js");
    await rm(libTsc);
    await symlink(evil, libTsc);
    await mkdir(path.join(root, "node_modules", ".bin"));
    await symlink(
      path.join("..", "typescript", "bin", "tsc"),
      path.join(root, "node_modules", ".bin", "tsc"),
    );
    assert.equal(resolveProjectTypeScriptCompiler(root), null);
    const result = await runProjectTypecheck(root, 30_000);
    assert.equal(result.unavailableTool, true);
    assert.equal(result.ok, false);
    assert.equal(result.command.includes("npx"), false);
    assert.equal(await readFile(marker, "utf8").then(() => true, () => false), false);
  });

  it("falls back to typescript/lib/tsc.js when the bin entry is untrusted", async () => {
    const root = await makeTemp("bl-tsc-fallback-");
    const marker = path.join(root, "hostile-bin-ran");
    await installLocalTypeScript(root);
    await rm(path.join(root, "node_modules", "typescript", "bin", "tsc"), { force: true });
    await mkdir(path.join(root, "node_modules", ".bin"));
    await writeFile(
      path.join(root, "node_modules", ".bin", "tsc"),
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`,
      "utf8",
    );
    await chmod(path.join(root, "node_modules", ".bin", "tsc"), 0o755);
    await writeMathProject(root, cleanMath);
    const resolved = resolveProjectTypeScriptCompiler(root);
    assert.ok(resolved);
    assert.equal(resolved.kind, "typescript-lib");
    assert.equal(
      resolved.scriptPath.endsWith(`${path.sep}typescript${path.sep}lib${path.sep}tsc.js`),
      true,
    );
    const result = await runProjectTypecheck(root, 60_000);
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.unavailableTool, false);
    assert.equal(result.command.includes("npx"), false);
    assert.ok(resolved);
    assert.equal(result.command.includes(resolved.scriptPath), true);
    assert.equal(await readFile(marker, "utf8").then(() => true, () => false), false);
  });

  it("does not apply NODE_OPTIONS or PATH when launching the compiler", async () => {
    const previousOptions = process.env.NODE_OPTIONS;
    const previousPath = process.env.PATH;
    process.env.NODE_OPTIONS = "--require /tmp/bryantlabs-not-a-preload.cjs";
    process.env.PATH = "/tmp/bryantlabs-not-a-path";
    try {
      const env = compilerChildEnv();
      assert.equal(env.NODE_OPTIONS, undefined);
      assert.equal(env.PATH, undefined);
      assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
      assert.equal(Object.hasOwn(env, "npm_config_script_shell"), false);
    } finally {
      if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previousOptions;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }

    const root = await makeTemp("bl-tsc-env-");
    const marker = path.join(root, "preload-ran");
    const preload = path.join(root, "preload.cjs");
    await writeFile(
      preload,
      `require("fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
      "utf8",
    );
    await installLocalTypeScript(root);
    await writeMathProject(root, cleanMath);
    process.env.NODE_OPTIONS = `--require ${preload}`;
    try {
      const result = await runProjectTypecheck(root, 60_000);
      assert.equal(result.ok, true);
      assert.equal(result.exitCode, 0);
      assert.equal(result.unavailableTool, false);
      assert.equal(await readFile(marker, "utf8").then(() => true, () => false), false);
    } finally {
      if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previousOptions;
    }
  });

  it("does not interpret shell metacharacters in the project path", async () => {
    const parent = await makeTemp("bl-tsc-shell-");
    const marker = path.join(parent, "marker");
    const root = path.join(parent, "proj;touch marker");
    await mkdir(root);
    await installLocalTypeScript(root);
    await writeMathProject(root, plantedMath);
    const result = await runProjectTypecheck(root, 60_000);
    assert.equal(result.ok, false);
    assert.match(result.stdout, /error TS2322/);
    assert.equal(result.command.includes("npx"), false);
    assert.equal(await readFile(marker, "utf8").then(() => true, () => false), false);
  });
});
