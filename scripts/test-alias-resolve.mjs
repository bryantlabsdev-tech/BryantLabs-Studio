import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = path.join(import.meta.dirname, "..", "src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const base = path.join(srcRoot, rel);
    for (const file of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      try {
        return await nextResolve(pathToFileURL(file).href, context);
      } catch {
        // try next candidate
      }
    }
    return nextResolve(specifier, context);
  }

  if (
    specifier.startsWith(".") &&
    !specifier.endsWith(".ts") &&
    !specifier.endsWith(".js") &&
    !specifier.endsWith(".mjs")
  ) {
    const parent = path.dirname(fileURLToPath(context.parentURL));
    const base = path.resolve(parent, specifier);
    for (const file of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      try {
        return await nextResolve(pathToFileURL(file).href, context);
      } catch {
        // try next candidate
      }
    }
  }

  return nextResolve(specifier, context);
}
