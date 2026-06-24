import type { ProjectInfo, ProjectScan } from "@/types";
import * as monaco from "monaco-editor";
import { isTypeScriptLike, monacoLanguageId } from "@/monaco/language";
import { parseTsconfigCompilerOptions } from "@/monaco/tsconfig";

import { joinProjectPath, isTypeScriptLikePath } from "@/monaco/projectPaths";

export { joinProjectPath, isTypeScriptLikePath } from "@/monaco/projectPaths";

export const MAX_SYNC_FILES = 200;

const { typescriptDefaults, javascriptDefaults, ScriptTarget, ModuleKind, ModuleResolutionKind, JsxEmit } =
  monaco.typescript;

let syncGeneration = 0;

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
    skipLibCheck: true,
    isolatedModules: true,
  };
}

function applyCompilerOptions(
  parsed: ReturnType<typeof parseTsconfigCompilerOptions>,
): void {
  const opts = { ...defaultCompilerOptions() };
  if (parsed?.strict !== undefined) opts.strict = parsed.strict;
  if (parsed?.noEmit !== undefined) opts.noEmit = parsed.noEmit;
  if (parsed?.allowJs !== undefined) opts.allowJs = parsed.allowJs;
  if (parsed?.esModuleInterop !== undefined) opts.esModuleInterop = parsed.esModuleInterop;
  if (parsed?.skipLibCheck !== undefined) opts.skipLibCheck = parsed.skipLibCheck;
  if (parsed?.baseUrl) opts.baseUrl = parsed.baseUrl;
  if (parsed?.paths) opts.paths = parsed.paths;

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

async function applyTsconfigFromProject(
  project: ProjectInfo,
  readFile: (absPath: string) => Promise<{ readable: boolean; content?: string }>,
): Promise<void> {
  const tsconfigPath = joinProjectPath(project.path, "tsconfig.json");
  try {
    const tsconfigRes = await readFile(tsconfigPath);
    if (tsconfigRes.readable && tsconfigRes.content) {
      applyCompilerOptions(parseTsconfigCompilerOptions(tsconfigRes.content));
    } else {
      applyCompilerOptions(null);
    }
  } catch {
    applyCompilerOptions(null);
  }
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
  await applyTsconfigFromProject(project, readFile);
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
}
