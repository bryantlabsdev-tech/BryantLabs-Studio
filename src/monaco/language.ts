/** Map BryantLabs file language hints to Monaco language ids. */
export function monacoLanguageId(language: string | null, filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const byLang: Record<string, string> = {
    typescript: "typescript",
    ts: "typescript",
    tsx: "typescript",
    javascript: "javascript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    markdown: "markdown",
    md: "markdown",
    python: "python",
    rust: "rust",
    go: "go",
    java: "java",
    csharp: "csharp",
    cpp: "cpp",
    c: "c",
    shell: "shell",
    sh: "shell",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sql: "sql",
  };

  if (language) {
    const normalized = language.toLowerCase();
    if (byLang[normalized]) return byLang[normalized];
    if (normalized === "tsx" || normalized === "typescriptreact") return "typescript";
    if (normalized === "jsx" || normalized === "javascriptreact") return "javascript";
  }

  const byExt: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    cc: "cpp",
    c: "c",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
    xml: "xml",
    sql: "sql",
  };

  return byExt[ext] ?? "plaintext";
}

export function isTypeScriptLike(languageId: string): boolean {
  return languageId === "typescript" || languageId === "javascript";
}
