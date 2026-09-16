#!/usr/bin/env node
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesRoot = path.join(projectRoot, "node_modules");

// Each addition requires human review. Expressions are kept exact so a changed
// package license cannot silently pass through a substring match.
const ALLOWED_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "WTFPL",
  "WTFPL OR ISC",
  "(MIT OR CC0-1.0)",
  "(MPL-2.0 OR Apache-2.0)",
  "(WTFPL OR ISC)",
  "(WTFPL OR MIT)",
]);

async function packageDirectories(nodeModulesDir, found, visited) {
  let real;
  try {
    real = await realpath(nodeModulesDir);
  } catch {
    return;
  }
  if (visited.has(real)) return;
  visited.add(real);

  for (const entry of await readdir(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".cache") continue;
    const entryPath = path.join(nodeModulesDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scoped of await readdir(entryPath, { withFileTypes: true })) {
        if (!scoped.isDirectory() || scoped.isSymbolicLink()) continue;
        const packageDir = path.join(entryPath, scoped.name);
        found.add(packageDir);
        await packageDirectories(path.join(packageDir, "node_modules"), found, visited);
      }
      continue;
    }
    if (!entry.isDirectory()) continue;
    found.add(entryPath);
    await packageDirectories(path.join(entryPath, "node_modules"), found, visited);
  }
}

function normalizedLicense(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.type === "string") return value.type.trim();
  return "";
}

try {
  const rootStat = await lstat(modulesRoot);
  if (!rootStat.isDirectory()) throw new Error("node_modules is not a directory");

  const directories = new Set();
  await packageDirectories(modulesRoot, directories, new Set());
  const failures = [];
  let checked = 0;

  for (const packageDir of [...directories].sort()) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const name = typeof manifest.name === "string" ? manifest.name : path.basename(packageDir);
    const version = typeof manifest.version === "string" ? manifest.version : "unknown";
    const license = normalizedLicense(manifest.license ?? manifest.licenses?.[0]);
    checked += 1;
    if (!license) failures.push(`${name}@${version}: missing license metadata`);
    else if (!ALLOWED_LICENSES.has(license)) failures.push(`${name}@${version}: unreviewed license ${license}`);
  }

  if (checked === 0) throw new Error("no installed package manifests were found");
  if (failures.length > 0) {
    console.error(`Dependency license policy failed (${failures.length} issue(s)):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Dependency license policy passed for ${checked} installed packages.`);
} catch (error) {
  console.error(`Dependency license policy could not run: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
