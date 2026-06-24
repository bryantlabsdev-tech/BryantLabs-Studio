import { stripMarkerArtifactsFromContent } from "@/core/greenfield/markerContentSanitizer";
import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";
import { sanitizeGeneratedTsxSource } from "@/core/typescript/generatedTsxSanitizer";
import {
  buildIconStubModule,
  repairIconLibrariesInProject,
  rewriteIconImportInFile,
} from "@/core/typescript/iconLibraryRepair";
import {
  normalizeNamedComponentExport,
} from "@/core/typescript/exportImportRepair";

export interface GenerationHardeningResult {
  readonly files: readonly GreenfieldProjectFile[];
  readonly fixes: readonly string[];
}

/** Line ends with model truncation (e.g. `{ id:...`) — causes TS1109 at build time. */
export function lineIsTruncated(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
  if (/^\s*\{[^}]*\.\.\./.test(line)) return true;
  if (/^\s*\[[^\]]*\.\.\./.test(line)) return true;
  if (/\.\.\.\s*,?\s*$/.test(trimmed) && !/\.\.\.[\w$]/.test(trimmed)) return true;
  return false;
}

/** Remove truncated lines from generated source before write. */
export function repairTruncatedLines(content: string): {
  content: string;
  removedLines: number;
} {
  const lines = content.split("\n");
  const kept = lines.filter((line) => !lineIsTruncated(line));
  if (kept.length === lines.length) {
    return { content, removedLines: 0 };
  }
  return { content: kept.join("\n"), removedLines: lines.length - kept.length };
}

function arrayLiteralIsClosed(content: string, openBracketIndex: number): boolean {
  let depth = 0;
  for (let i = openBracketIndex; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return true;
    }
  }
  return false;
}

/** Close mock arrays and stub pages when generation stopped mid-file. */
export function repairTruncatedPageSource(
  content: string,
  relPath = "",
): {
  content: string;
  repaired: boolean;
} {
  const truncated = repairTruncatedLines(content);
  let next = truncated.content;
  let repaired = truncated.removedLines > 0;

  const mockMatch = next.match(/const\s+(mock\w+)\s*:\s*[^=]+=\s*\[/);
  if (!mockMatch || mockMatch.index === undefined) {
    return { content: next, repaired };
  }

  const mockName = mockMatch[1]!;
  const eqIndex = next.indexOf("=", mockMatch.index);
  const bracketIndex = eqIndex >= 0 ? next.indexOf("[", eqIndex) : -1;
  if (bracketIndex < 0 || arrayLiteralIsClosed(next, bracketIndex)) {
    return { content: next, repaired };
  }

  next = `${next.trimEnd()}\n];\n`;
  repaired = true;

  if (!/export\s+default/.test(next)) {
    const pageName =
      componentNameFromPath(relPath) ??
      mockName.replace(/^mock/, "").replace(/^./, (c) => c.toUpperCase());
    const usesState = /\buseState\b/.test(next);
    const stateLine = usesState ? `  const [items] = useState(${mockName});\n` : "";
    const body = usesState
      ? `<div className="p-4">{items.length} items</div>`
      : `<div className="p-4">Page</div>`;
    next += `\nexport default function ${pageName}() {\n${stateLine}  return ${body};\n}\n`;
    repaired = true;
  }

  return { content: next, repaired };
}

function componentNameFromPath(path: string): string | null {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const match = base.match(/^([A-Za-z][A-Za-z0-9]*)\.tsx$/);
  return match?.[1] ?? null;
}

function shellComponentName(path: string): "Layout" | "Sidebar" | null {
  if (path.endsWith("Layout.tsx")) return "Layout";
  if (path.endsWith("Sidebar.tsx")) return "Sidebar";
  return null;
}

function fixSidebarImportInLayout(content: string): string | null {
  const next = content
    .replace(
      /import\s+Sidebar\s+from\s+(['"]\.\/Sidebar['"])/g,
      "import { Sidebar } from $1",
    )
    .replace(
      /import\s+Sidebar\s+from\s+(['"]\.\/components\/Sidebar['"])/g,
      "import { Sidebar } from $1",
    );
  return next === content ? null : next;
}

function hardenSingleFile(file: GreenfieldProjectFile): {
  file: GreenfieldProjectFile;
  fixes: string[];
} {
  const fixes: string[] = [];
  let content = stripMarkerArtifactsFromContent(file.content);

  const truncated = repairTruncatedLines(content);
  if (truncated.removedLines > 0) {
    content = truncated.content;
    fixes.push(`removed ${truncated.removedLines} truncated line(s)`);
  }

  if (/\.tsx$/.test(file.path)) {
    const tsxSanitized = sanitizeGeneratedTsxSource(content);
    if (tsxSanitized) {
      content = tsxSanitized;
      fixes.push("tsx sanitizer");
    }

    const iconRewritten = rewriteIconImportInFile(content, file.path);
    if (iconRewritten) {
      content = iconRewritten.content;
      fixes.push("icon stub import");
    }

    const shell = shellComponentName(file.path);
    if (shell) {
      const normalized = normalizeNamedComponentExport(content, shell);
      if (normalized) {
        content = normalized;
        fixes.push(`${shell} named export`);
      }
    }

    if (file.path.endsWith("Layout.tsx")) {
      const layoutImport = fixSidebarImportInLayout(content);
      if (layoutImport) {
        content = layoutImport;
        fixes.push("Layout Sidebar import");
      }
    }
  }

  return {
    file: content === file.content ? file : { ...file, content },
    fixes,
  };
}

const DEFAULT_ICON_SYMBOLS = [
  "Menu",
  "Home",
  "Settings",
  "Plus",
  "Search",
  "Users",
  "Calendar",
  "FileText",
  "Truck",
  "BarChart3",
  "Bell",
  "ChevronRight",
] as const;

/** Post-phase cleanup: truncation, icons, export conventions. */
export function hardenGreenfieldProjectFiles(
  files: readonly GreenfieldProjectFile[],
  _manifest?: GreenfieldManifest,
): GenerationHardeningResult {
  const fixes: string[] = [];
  let map = new Map<string, string>(files.map((f) => [f.path, f.content]));

  for (const file of files) {
    const result = hardenSingleFile(file);
    if (result.fixes.length > 0) {
      map.set(file.path, result.file.content);
      fixes.push(`${file.path}: ${result.fixes.join(", ")}`);
    }
  }

  const iconRepair = repairIconLibrariesInProject(map);
  if (iconRepair.changed) {
    map = new Map(iconRepair.files);
    fixes.push("project-wide icon library rewrite");
  }

  if (!map.has("src/components/IconStub.tsx")) {
    const symbols = new Set<string>([...DEFAULT_ICON_SYMBOLS]);
    for (const content of map.values()) {
      for (const match of content.matchAll(
        /import\s+\{([^}]+)\}\s+from\s+['"][^'"]*IconStub['"]/g,
      )) {
        for (const part of match[1]!.split(",")) {
          const name = part.trim().split(/\s+as\s+/)[0]!.trim();
          if (name) symbols.add(name);
        }
      }
    }
    map.set("src/components/IconStub.tsx", buildIconStubModule([...symbols]));
    fixes.push("scaffolded IconStub.tsx");
  } else {
    const stub = map.get("src/components/IconStub.tsx")!;
    const symbols = [...stub.matchAll(/export const (\w+) = IconStub/g)].map((m) => m[1]!);
    if (symbols.length > 0) {
      const upgraded = buildIconStubModule(symbols);
      if (upgraded !== stub) {
        map.set("src/components/IconStub.tsx", upgraded);
      }
    }
  }

  const out: GreenfieldProjectFile[] = files.map((f) => ({
    path: f.path,
    content: map.get(f.path) ?? f.content,
  }));

  for (const [path, content] of map) {
    if (!out.some((f) => f.path === path)) {
      out.push({ path: path as GreenfieldProjectFile["path"], content });
    }
  }

  return { files: out, fixes };
}

export { componentNameFromPath, shellComponentName };
