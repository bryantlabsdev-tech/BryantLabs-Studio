import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";

/**
 * Disposable E2E projects need a TypeScript compiler whose real path stays
 * inside the project. Studio rejects a compiler reached through a node_modules
 * symlink that leaves the project, and it does not download a substitute.
 * Supporting libraries stay as symlinks into this checkout.
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

function isInside(abs: string, root: string): boolean {
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function assertInside(abs: string, root: string, label: string): Promise<void> {
  if (!isInside(abs, root)) {
    throw new Error(`${label} leaves its allowed directory.`);
  }
}

export async function installTrustedOfflineProjectDependencies(
  projectDir: string,
  repoRoot: string,
): Promise<void> {
  const repoReal = await realpath(repoRoot);
  const repoNodeModules = await realpath(join(repoReal, "node_modules"));
  await assertInside(repoNodeModules, repoReal, "Checkout node_modules");
  const projectReal = await realpath(projectDir);
  const destRoot = join(projectDir, "node_modules");
  try {
    const existing = await lstat(destRoot);
    if (existing.isSymbolicLink()) {
      throw new Error("Refusing to install into a symlinked node_modules.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
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
  const copiedCompilerStat = await lstat(copiedCompiler);
  if (!copiedCompilerStat.isFile() || copiedCompilerStat.isSymbolicLink()) {
    throw new Error("Copied tsc.js must be a regular file.");
  }
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
