import type { ProjectInfo, ProjectScan } from "@/types";
import * as monaco from "monaco-editor";
import { isTypeScriptLike, monacoLanguageId } from "@/monaco/language";
import { parseTsconfigCompilerOptions } from "@/monaco/tsconfig";

import { joinProjectPath, isTypeScriptLikePath } from "@/monaco/projectPaths";
import {
  monacoProjectTypeLibSpecs,
  monacoReactCompilerPaths,
  selectMonacoTypeLibs,
} from "@/monaco/projectTypeLibs";

export { joinProjectPath, isTypeScriptLikePath } from "@/monaco/projectPaths";

export const MAX_SYNC_FILES = 200;

const { typescriptDefaults, javascriptDefaults, ScriptTarget, ModuleKind, ModuleResolutionKind, JsxEmit } =
  monaco.typescript;

let syncGeneration = 0;
const extraLibDisposables: monaco.IDisposable[] = [];

function defaultCompilerOptions(): monaco.typescript.CompilerOptions {
  return {
    target: ScriptTarget.ES2020,
    module: ModuleKind.ESNext,
    moduleResolution: ModuleResolutionKind.NodeJs,
    jsx: JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    isolatedModules: true,
  };
}

function applyCompilerOptions(
  parsed: ReturnType<typeof parseTsconfigCompilerOptions>,
  projectPath?: string,
  reactTypesLoaded = false,
): void {
  const opts = { ...defaultCompilerOptions() };
  if (parsed?.strict !== undefined) opts.strict = parsed.strict;
  if (parsed?.noEmit !== undefined) opts.noEmit = parsed.noEmit;
  if (parsed?.allowJs !== undefined) opts.allowJs = parsed.allowJs;
  if (parsed?.esModuleInterop !== undefined) opts.esModuleInterop = parsed.esModuleInterop;
  if (parsed?.skipLibCheck !== undefined) opts.skipLibCheck = parsed.skipLibCheck;
  if (parsed?.jsx !== undefined) opts.jsx = parsed.jsx;
  if (parsed?.moduleResolution !== undefined) opts.moduleResolution = parsed.moduleResolution;
  if (projectPath) {
    opts.baseUrl = projectPath;
  } else if (parsed?.baseUrl) {
    opts.baseUrl = parsed.baseUrl;
  }
  opts.paths = {
    ...(parsed?.paths ?? {}),
    ...(reactTypesLoaded && projectPath ? monacoReactCompilerPaths(projectPath) : {}),
  };

  typescriptDefaults.setCompilerOptions(opts);
  javascriptDefaults.setCompilerOptions({
    ...opts,
    allowJs: true,
    checkJs: true,
  });
  typescriptDefaults.setEagerModelSync(true);
  javascriptDefaults.setEagerModelSync(true);
  typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

function disposeProjectModels(projectPath: string): void {
  const prefix = monaco.Uri.file(projectPath).toString();
  for (const model of monaco.editor.getModels()) {
    if (model.uri.toString().startsWith(prefix)) {
      model.dispose();
    }
  }
}

/** Dispose Monaco models for specific absolute file paths. */
export function disposeMonacoModelsForPaths(absPaths: readonly string[]): void {
  for (const absPath of absPaths) {
    monaco.editor.getModel(monaco.Uri.file(absPath))?.dispose();
  }
}

function clearExtraLibs(): void {
  while (extraLibDisposables.length > 0) {
    extraLibDisposables.pop()?.dispose();
  }
}

async function applyTsconfigFromProject(
  project: ProjectInfo,
  readFile: (absPath: string) => Promise<{ readable: boolean; content?: string }>,
  reactTypesLoaded = false,
): Promise<void> {
  const tsconfigPath = joinProjectPath(project.path, "tsconfig.json");
  try {
    const tsconfigRes = await readFile(tsconfigPath);
    if (tsconfigRes.readable && tsconfigRes.content) {
      applyCompilerOptions(
        parseTsconfigCompilerOptions(tsconfigRes.content),
        project.path,
        reactTypesLoaded,
      );
    } else {
      applyCompilerOptions(null, project.path, reactTypesLoaded);
    }
  } catch {
    applyCompilerOptions(null, project.path, reactTypesLoaded);
  }
}

function extraLibLanguage(relPath: string): string {
  if (relPath.endsWith("package.json")) return "json";
  return "typescript";
}

/**
 * Load installed React/Vite type packages into Monaco extra libs.
 * Returns true when `@types/react` was actually readable (npm install finished).
 */
export async function syncMonacoProjectTypeLibs(
  project: ProjectInfo,
  readFile: (absPath: string) => Promise<{ readable: boolean; content?: string }>,
): Promise<boolean> {
  clearExtraLibs();
  let packageJson: string | null = null;
  try {
    const pkg = await readFile(joinProjectPath(project.path, "package.json"));
    if (pkg.readable && pkg.content) packageJson = pkg.content;
  } catch {
    packageJson = null;
  }
  const specs = selectMonacoTypeLibs(monacoProjectTypeLibSpecs(project.path), packageJson);
  let loadedReact = false;
  await Promise.all(
    specs.map(async (spec) => {
      try {
        const res = await readFile(spec.absPath);
        if (!res.readable || res.content === undefined) return;
        if (spec.relPath.endsWith("@types/react/index.d.ts")) loadedReact = true;
        const uri = monaco.Uri.file(spec.absPath).toString();
        extraLibDisposables.push(typescriptDefaults.addExtraLib(res.content, uri));
        ensureMonacoModel(spec.absPath, res.content, extraLibLanguage(spec.relPath));
      } catch {
        // skip missing optional type packages
      }
    }),
  );
  await applyTsconfigFromProject(project, readFile, loadedReact);
  return loadedReact;
}

/**
 * Sync project TypeScript/JavaScript files into Monaco for cross-file intelligence.
 * Used once per project open — prefer {@link syncMonacoChangedFiles} for index deltas.
 */
export async function syncMonacoTypeScriptProject(
  project: ProjectInfo,
  scan: ProjectScan,
  readFile: (absPath: string) => Promise<{ readable: boolean; content?: string }>,
): Promise<void> {
  const generation = ++syncGeneration;
  disposeProjectModels(project.path);
  await applyTsconfigFromProject(project, readFile, false);
  if (generation !== syncGeneration) return;
  await syncMonacoProjectTypeLibs(project, readFile);
  if (generation !== syncGeneration) return;

  const candidates = scan.files
    .filter((f) => isTypeScriptLikePath(f.path))
    .slice(0, MAX_SYNC_FILES);

  await Promise.all(
    candidates.map(async (file) => {
      if (generation !== syncGeneration) return;
      try {
        const res = await readFile(file.absPath);
        if (!res.readable || res.content === undefined) return;
        const lang = monacoLanguageId(null, file.path);
        if (!isTypeScriptLike(lang)) return;
        ensureMonacoModel(file.absPath, res.content, lang);
      } catch {
        // skip unreadable files
      }
    }),
  );
}

/**
 * Incrementally update Monaco models for changed/deleted files after an index delta.
 */
export async function syncMonacoChangedFiles(
  project: ProjectInfo,
  changedRelPaths: readonly string[],
  deletedRelPaths: readonly string[],
  readFile: (absPath: string) => Promise<{ readable: boolean; content?: string }>,
): Promise<void> {
  if (changedRelPaths.length === 0 && deletedRelPaths.length === 0) return;

  const deletedAbs = [...new Set(deletedRelPaths)]
    .filter((rel) => rel.length > 0)
    .map((rel) => joinProjectPath(project.path, rel));
  disposeMonacoModelsForPaths(deletedAbs);

  const changed = [...new Set(changedRelPaths)].filter(
    (rel) => rel.length > 0 && isTypeScriptLikePath(rel),
  );

  await Promise.all(
    changed.map(async (rel) => {
      const absPath = joinProjectPath(project.path, rel);
      try {
        const res = await readFile(absPath);
        if (!res.readable || res.content === undefined) {
          disposeMonacoModelsForPaths([absPath]);
          return;
        }
        const lang = monacoLanguageId(null, rel);
        if (!isTypeScriptLike(lang)) return;
        ensureMonacoModel(absPath, res.content, lang);
      } catch {
        disposeMonacoModelsForPaths([absPath]);
      }
    }),
  );
}

export function ensureMonacoModel(
  absPath: string,
  content: string,
  language: string | null,
): monaco.editor.ITextModel {
  const uri = monaco.Uri.file(absPath);
  const lang = monacoLanguageId(language, absPath);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== content) {
      existing.setValue(content);
    }
    return existing;
  }
  return monaco.editor.createModel(content, lang, uri);
}

export function resetMonacoTypeScriptProject(): void {
  syncGeneration++;
  clearExtraLibs();
}
