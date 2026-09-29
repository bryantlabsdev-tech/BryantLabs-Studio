import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, lstat, readFile, realpath, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { installTrustedOfflineProjectDependencies } from "./offlineProjectCompiler.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function run(command: string, args: string[], cwd: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: "pipe" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

describe("trusted offline project compiler", () => {
  it("copies tsc.js inside the project and keeps supporting packages in the checkout", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "bl-offline-compiler-"));
    try {
      await installTrustedOfflineProjectDependencies(projectDir, repoRoot);
      const projectReal = await realpath(projectDir);
      const nodeModules = await lstat(join(projectDir, "node_modules"));
      assert.equal(nodeModules.isSymbolicLink(), false);
      assert.equal(nodeModules.isDirectory(), true);

      const copied = join(projectDir, "node_modules", "typescript", "lib", "tsc.js");
      const copiedReal = await realpath(copied);
      const copiedRel = relative(projectReal, copiedReal);
      assert.equal(copiedRel.startsWith("..") || isAbsolute(copiedRel), false);
      assert.notEqual(copiedRel, "");
      const copiedStat = await lstat(copiedReal);
      assert.equal(copiedStat.isFile(), true);
      const checkout = await readFile(join(repoRoot, "node_modules", "typescript", "lib", "tsc.js"));
      assert.equal((await readFile(copiedReal)).equals(checkout), true);

      const tscBin = await realpath(join(projectDir, "node_modules", ".bin", "tsc"));
      const tscBinRel = relative(projectReal, tscBin);
      assert.equal(tscBinRel.startsWith("..") || isAbsolute(tscBinRel), false);
      const reactReal = await realpath(join(projectDir, "node_modules", "react"));
      const checkoutModules = await realpath(join(repoRoot, "node_modules"));
      const reactRel = relative(checkoutModules, reactReal);
      assert.equal(reactRel.startsWith("..") || isAbsolute(reactRel), false);

      await mkdir(join(projectDir, "src"), { recursive: true });
      await writeFile(
        join(projectDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, noEmit: true, module: "esnext", moduleResolution: "bundler" },
          include: ["src"],
        }),
      );
      await writeFile(join(projectDir, "src", "ok.ts"), "export const value: number = 1;\n");
      const exitCode = await run(process.execPath, [copiedReal, "--noEmit", "--pretty", "false"], projectDir);
      assert.equal(exitCode, 0);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it("refuses to write through a node_modules symlink that leaves the project", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "bl-offline-escape-"));
    const outside = await mkdtemp(join(tmpdir(), "bl-offline-outside-"));
    try {
      await symlink(outside, join(projectDir, "node_modules"), "dir");
      await assert.rejects(
        () => installTrustedOfflineProjectDependencies(projectDir, repoRoot),
        /symlinked node_modules/,
      );
      await assert.rejects(lstat(join(outside, "typescript")));
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
