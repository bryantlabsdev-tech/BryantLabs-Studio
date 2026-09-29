import { cp, lstat, mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { isInside, repoRootFromHarness } from "./fs.ts";

/**
 * D1 trials get this checkout's TypeScript compiler as real files inside the
 * project. Studio accepts that compiler only when its real path stays inside
 * the project, and it does not download or trust a compiler elsewhere.
 * Supporting libraries are symlinks back into this checkout's node_modules so
 * typecheck and the evaluator build stay offline. Those links are not the
 * compiler, and their targets must stay inside the checkout node_modules.
 */

const COMPILER_PACKAGE = "typescript";

const LINKED_PACKAGES = [
  "react",
  "react-dom",
  "scheduler",
  "@types/react",
  "@types/react-dom",
  "csstype",
  "vite",
  "@vitejs/plugin-react",
  "@rolldown/pluginutils",
] as const;

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

function packageSegments(name: string): string[] {
  if (!PACKAGE_NAME.test(name) || name.includes("..")) {
    throw new Error(`Refusing unexpected package name: ${name}`);
  }
  return name.split("/");
}

async function assertInside(abs: string, root: string, label: string): Promise<void> {
  if (!isInside(abs, root)) {
    throw new Error(`${label} leaves its allowed directory.`);
  }
}

export async function installD1OfflineTypecheckDependencies(projectDir: string): Promise<void> {
  const repoRoot = await realpath(repoRootFromHarness());
  const repoNodeModules = await realpath(join(repoRoot, "node_modules"));
  await assertInside(repoNodeModules, repoRoot, "Checkout node_modules");
  const projectReal = await realpath(projectDir);
  const destRoot = join(projectDir, "node_modules");
  await mkdir(destRoot, { recursive: true });

  const compilerSrc = join(repoNodeModules, COMPILER_PACKAGE);
  if (!existsSync(compilerSrc)) {
    throw new Error("Checkout is missing node_modules/typescript. Run npm install in the checkout.");
  }
  const compilerReal = await realpath(compilerSrc);
  await assertInside(compilerReal, repoNodeModules, "Checkout TypeScript package");
  const compilerStat = await lstat(compilerReal);
  if (!compilerStat.isDirectory()) {
    throw new Error("Checkout TypeScript package is not a directory.");
  }
  const compilerDest = join(destRoot, COMPILER_PACKAGE);
  await cp(compilerReal, compilerDest, { recursive: true, dereference: true });
  const copiedCompiler = await realpath(join(compilerDest, "lib", "tsc.js"));
  await assertInside(copiedCompiler, projectReal, "Copied tsc.js");
  const sourceCompiler = await realpath(join(compilerReal, "lib", "tsc.js"));
  const [sourceBytes, copiedBytes] = await Promise.all([
    readFile(sourceCompiler),
    readFile(copiedCompiler),
  ]);
  if (!sourceBytes.equals(copiedBytes)) {
    throw new Error("Copied tsc.js does not match the checkout TypeScript compiler.");
  }
  const copiedRootStat = await lstat(compilerDest);
  if (copiedRootStat.isSymbolicLink()) {
    throw new Error("Copied TypeScript package must be a real directory, not a symlink.");
  }

  for (const name of LINKED_PACKAGES) {
    const segments = packageSegments(name);
    const src = join(repoNodeModules, ...segments);
    if (!existsSync(src)) {
      throw new Error(`Checkout is missing node_modules/${name}. Run npm install in the checkout.`);
    }
    const srcReal = await realpath(src);
    await assertInside(srcReal, repoNodeModules, `Checkout package ${name}`);
    const dest = join(destRoot, ...segments);
    await mkdir(dirname(dest), { recursive: true });
    await symlink(srcReal, dest);
    const linked = await realpath(dest);
    await assertInside(linked, repoNodeModules, `Linked package ${name}`);
  }

  const binDir = join(destRoot, ".bin");
  await mkdir(binDir, { recursive: true });
  const tscLink = join(binDir, "tsc");
  await symlink(join("..", "typescript", "bin", "tsc"), tscLink);
  const tscBinReal = await realpath(tscLink);
  await assertInside(tscBinReal, projectReal, "Project-local tsc");
  const viteLink = join(binDir, "vite");
  await symlink(join("..", "vite", "bin", "vite.js"), viteLink);
  const viteBinReal = await realpath(viteLink);
  await assertInside(viteBinReal, repoNodeModules, "Checkout Vite binary");
}
