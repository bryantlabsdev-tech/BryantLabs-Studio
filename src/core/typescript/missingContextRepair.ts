const CONTEXT_MODULE_PATTERNS = [
  /from\s+['"](\.\/contexts\/DataProvider)['"]/,
  /from\s+['"](\.\/contexts\/AppProvider)['"]/,
  /from\s+['"](\.\/context\/DataProvider)['"]/,
  /from\s+['"](\.\/providers\/DataProvider)['"]/,
];

const CONTEXT_IMPORT_RE =
  /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]*(?:DataProvider|AppProvider|AppContext)[^'"]*)['"]/g;

function normalizeRelPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function resolveImportPath(fromFile: string, importPath: string): string {
  const fromDir = normalizeRelPath(fromFile).replace(/\/[^/]+$/, "") || ".";
  const parts = importPath.split("/");
  const stack = fromDir === "." ? [] : fromDir.split("/");
  for (const part of parts) {
    if (part === "." || !part) continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  let resolved = stack.join("/");
  if (!/\.tsx?$/.test(resolved)) resolved += ".tsx";
  return resolved;
}

export function detectMissingContextImports(
  appSource: string,
): { importPath: string; relFile: string; symbols: string[] } | null {
  for (const re of CONTEXT_MODULE_PATTERNS) {
    const match = appSource.match(re);
    if (!match?.[1]) continue;
    const importPath = match[1];
    const relFile = resolveImportPath("src/App.tsx", importPath);
    const symbols: string[] = [];
    for (const importMatch of appSource.matchAll(CONTEXT_IMPORT_RE)) {
      if (!importMatch[2]?.includes(importPath.replace(/^\.\//, ""))) continue;
      symbols.push(
        ...importMatch[1]!
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    return { importPath, relFile, symbols: [...new Set(symbols)] };
  }

  const generic = appSource.match(
    /import\s+\{([^}]+)\}\s+from\s+['"](\.\/[^'"]*(?:Provider|Context)[^'"]*)['"]/,
  );
  if (!generic?.[2]) return null;
  return {
    importPath: generic[2],
    relFile: resolveImportPath("src/App.tsx", generic[2]),
    symbols: generic[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function buildMinimalContextModule(symbols: readonly string[]): string {
  const wantsProvider = symbols.some((s) => /Provider$/i.test(s));
  const wantsDataHook = symbols.some((s) => /^useData$/i.test(s));
  const wantsAppHook = symbols.some((s) => /^useAppData$/i.test(s));

  const lines = [
    'import { createContext, useContext, useMemo, useState, type ReactNode } from "react";',
    "",
    "type Store = Record<string, unknown>;",
    "const AppDataContext = createContext<Store>({});",
    "",
  ];

  if (wantsProvider || symbols.length === 0) {
    lines.push(
      "export function DataProvider({ children }: { children: ReactNode }) {",
      "  const [store] = useState<Store>(() => {",
      "    try {",
      '      const raw = localStorage.getItem("app-data");',
      "      return raw ? (JSON.parse(raw) as Store) : {};",
      "    } catch {",
      "      return {};",
      "    }",
      "  });",
      "  const value = useMemo(() => store, [store]);",
      "  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;",
      "}",
      "",
    );
  }

  if (wantsDataHook || wantsAppHook) {
    lines.push(
      "export function useData(): Store {",
      "  return useContext(AppDataContext);",
      "}",
      "",
      "export function useAppData(): Store {",
      "  return useContext(AppDataContext);",
      "}",
    );
  }

  if (symbols.includes("AppProvider") && !symbols.includes("DataProvider")) {
    lines.push(
      "export const AppProvider = DataProvider;",
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

export interface MissingContextRepairResult {
  readonly relPath: string;
  readonly content: string;
  readonly label: string;
}

export function repairMissingContextModule(
  appSource: string,
  existingFiles: ReadonlySet<string>,
): MissingContextRepairResult | null {
  const detected = detectMissingContextImports(appSource);
  if (!detected) return null;
  if (existingFiles.has(detected.relFile)) return null;

  return {
    relPath: detected.relFile,
    content: buildMinimalContextModule(detected.symbols),
    label: `generated missing context module ${detected.relFile}`,
  };
}
