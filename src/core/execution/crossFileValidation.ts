import type { ProjectScan } from "@/types";
import type {
  CrossFileValidationSummary,
  ExecutionFileEntry,
} from "@/core/execution/types";

const IMPORT_RE =
  /(?:import\s+[^'"]+from\s+|import\s*\(|export\s+[^'"]+from\s+)['"]([^'"]+)['"]/g;

function normalizeRelImport(fromPath: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const fromDir = fromPath.replace(/\\/g, "/").split("/").slice(0, -1);
  const parts = spec.replace(/^\.\//, "").split("/");
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") fromDir.pop();
    else fromDir.push(p);
  }
  let resolved = fromDir.join("/");
  if (!resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) {
    const candidates = [
      `${resolved}.tsx`,
      `${resolved}.ts`,
      `${resolved}/index.tsx`,
      `${resolved}/index.ts`,
    ];
    return candidates[0] ?? resolved;
  }
  return resolved;
}

function extractImportSpecs(content: string): string[] {
  const specs: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IMPORT_RE.source, "g");
  while ((m = re.exec(content)) !== null) {
    if (m[1]) specs.push(m[1]);
  }
  return specs;
}

function symbolExistsInContent(content: string, name: string): boolean {
  const patterns = [
    new RegExp(`export\\s+(?:function|const|class|type|interface)\\s+${name}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`),
    new RegExp(`export\\s+default\\s+(?:function|class)?\\s*${name}?`),
  ];
  return patterns.some((p) => p.test(content));
}

export function validateCrossFileBatch(
  files: readonly ExecutionFileEntry[],
  scan: ProjectScan,
): CrossFileValidationSummary {
  const issues: { file: string; message: string }[] = [];
  const knownPaths = new Set(scan.files.map((f) => f.path));
  const proposedPaths = new Set(files.map((f) => f.relPath));
  const contentByPath = new Map<string, string>();

  for (const f of files) {
    if (f.proposal?.newContent) {
      contentByPath.set(f.relPath, f.proposal.newContent);
    } else if (f.basisContent !== undefined) {
      contentByPath.set(f.relPath, f.basisContent);
    }
  }

  for (const f of files) {
    const content = contentByPath.get(f.relPath);
    if (!content) continue;

    for (const spec of extractImportSpecs(content)) {
      const rel = normalizeRelImport(f.relPath, spec);
      if (!rel) continue;
      const exists =
        knownPaths.has(rel) ||
        proposedPaths.has(rel) ||
        [...proposedPaths].some(
          (p) => p === rel || p.replace(/\.(tsx?)$/, "") === rel.replace(/\.(tsx?)$/, ""),
        );
      if (!exists) {
        issues.push({
          file: f.relPath,
          message: `Import "${spec}" does not resolve to a project or planned file.`,
        });
      }
    }

    const indexEntry = scan.index.find((e) => e.path === f.relPath);
    if (indexEntry) {
      for (const ref of indexEntry.referencedNames) {
        let found = false;
        for (const [path, body] of contentByPath) {
          if (path === f.relPath) continue;
          if (symbolExistsInContent(body, ref)) {
            found = true;
            break;
          }
        }
        if (!found) {
          const graph = scan.symbolGraph.find((n) => n.name === ref);
          if (graph && !knownPaths.has(graph.definedIn)) {
            issues.push({
              file: f.relPath,
              message: `Referenced symbol "${ref}" is not defined in an indexed file.`,
            });
          }
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
