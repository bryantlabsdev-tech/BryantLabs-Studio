import * as fs from "node:fs";
import * as path from "node:path";

const VITE_CONFIG_NAMES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "vite.config.cts",
] as const;

const RESOLVE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
];

export interface ViteConfigDiagnosticsPayload {
  readonly configFilePath: string | null;
  readonly configFileRelative: string | null;
  readonly importsDiscovered: readonly string[];
  readonly missingImports: readonly string[];
  readonly syntaxParseResult: string;
  readonly firstException: string | null;
  readonly exceptionName: string | null;
  readonly stackTrace: string | null;
  readonly rootCauseLine: string;
  readonly fullOutput: string;
}

export function isViteConfigLoadFailure(output: string): boolean {
  return /failed to load config from/i.test(output);
}

export function findViteConfigOnDisk(root: string): string | null {
  for (const name of VITE_CONFIG_NAMES) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export function extractConfigPathFromOutput(
  output: string,
  cwd: string,
): string | null {
  const m = output.match(
    /failed to load config from\s+(.+?)(?:\s*$|\s*\n)/im,
  );
  if (!m?.[1]) return null;
  const raw = m[1].trim().replace(/\u001b\[[0-9;]*m/g, "");
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(cwd, raw);
}

/** Static import sources from a Vite config file (best-effort). */
export function discoverConfigImports(configPath: string): string[] {
  let source: string;
  try {
    source = fs.readFileSync(configPath, "utf8");
  } catch {
    return [];
  }
  const found = new Set<string>();
  const patterns = [
    /\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1]) found.add(m[1]);
    }
  }
  return [...found];
}

function resolveRelativeImport(
  configDir: string,
  spec: string,
): string | null {
  const base = path.resolve(configDir, spec);
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = ext ? base + ext : base;
    if (fs.existsSync(candidate)) {
      const st = fs.statSync(candidate);
      if (st.isFile()) return candidate;
    }
  }
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const ext of ["/index.ts", "/index.js", "/index.mts", "/index.mjs"]) {
      const idx = base + ext;
      if (fs.existsSync(idx)) return idx;
    }
  }
  return null;
}

function packageExistsInNodeModules(root: string, spec: string): boolean {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) {
    return true;
  }
  const parts = spec.split("/");
  const pkgName = spec.startsWith("@")
    ? `${parts[0]}/${parts[1]}`
    : parts[0];
  if (!pkgName) return false;
  const pkgPath = path.join(root, "node_modules", pkgName);
  return fs.existsSync(pkgPath);
}

export function findMissingConfigImports(
  root: string,
  configPath: string,
  imports: readonly string[],
): string[] {
  const configDir = path.dirname(configPath);
  const missing: string[] = [];
  for (const spec of imports) {
    if (spec.startsWith("node:")) continue;
    if (spec.startsWith(".")) {
      if (!resolveRelativeImport(configDir, spec)) missing.push(spec);
      continue;
    }
    if (!packageExistsInNodeModules(root, spec)) missing.push(spec);
  }
  return missing;
}

export function basicSyntaxCheck(configPath: string): string {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    if (!raw.trim()) return "empty file";
    const opens = (raw.match(/[{[(]/g) ?? []).length;
    const closes = (raw.match(/[}\])]/g) ?? []).length;
    if (Math.abs(opens - closes) > 2) {
      return "unbalanced brackets (possible syntax error)";
    }
    return "readable (no obvious bracket imbalance)";
  } catch (e) {
    return `cannot read file: ${String(e)}`;
  }
}

export interface ParsedViteException {
  readonly name: string | null;
  readonly message: string;
  readonly file: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly stackTrace: string | null;
  readonly missingPackage: string | null;
  readonly missingRelative: string | null;
  readonly syntaxError: string | null;
  readonly invalidExport: boolean;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function relativeConfigLabel(
  configPath: string | null,
  cwd: string,
): string {
  if (!configPath) return "vite.config.ts";
  const rel = path.relative(cwd, configPath);
  return rel && !rel.startsWith("..") ? rel : path.basename(configPath);
}

function findLineForImportSpec(
  configPath: string | null,
  spec: string | null,
): number | null {
  if (!configPath || !spec) return null;
  try {
    const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
    const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`['"]${escaped}['"]`);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i] ?? "")) return i + 1;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Parse the underlying Vite/esbuild/Node error beneath the wrapper line. */
export function parseViteConfigException(
  output: string,
  _cwd: string,
  configPath: string | null,
): ParsedViteException | null {
  const text = stripAnsi(output);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const skipWrapper = (line: string) =>
    /failed to load config from/i.test(line) ||
    /^error when starting/i.test(line);

  let stackTrace: string | null = null;
  const stackStart = text.search(/\n\s+at\s+/);
  if (stackStart >= 0) {
    stackTrace = text.slice(stackStart).trim();
  }

  let name: string | null = null;
  let message = "";
  let file: string | null = null;
  let line: number | null = null;
  let column: number | null = null;
  let missingPackage: string | null = null;
  let missingRelative: string | null = null;
  let syntaxError: string | null = null;
  let invalidExport = false;

  const pkgMatch = text.match(
    /Cannot find package\s+'([^']+)'|Cannot find package\s+"([^"]+)"/i,
  );
  if (pkgMatch) {
    missingPackage = pkgMatch[1] ?? pkgMatch[2] ?? null;
  }
  if (!missingPackage) {
    const modMatch = text.match(
      /Cannot find module\s+'([^']+)'|Cannot find module\s+"([^"]+)"/i,
    );
    const spec = modMatch?.[1] ?? modMatch?.[2] ?? null;
    if (spec?.startsWith(".")) missingRelative = spec;
    else if (spec && !spec.startsWith("node:")) missingPackage = spec;
  }

  const resolveMatch = text.match(
    /Could not resolve\s+"([^"]+)"|Could not resolve\s+'([^']+)'/i,
  );
  if (resolveMatch) {
    const spec = resolveMatch[1] ?? resolveMatch[2] ?? null;
    if (spec?.startsWith(".")) missingRelative = spec;
    else if (spec) missingPackage = spec;
  }

  const esbuildLoc = text.match(
    /([^\s\n:]+\.(?:ts|tsx|js|mjs|cjs|mts|cts)):(\d+):(\d+):\s*ERROR:\s*(.+)/i,
  );
  if (esbuildLoc) {
    file = esbuildLoc[1] ?? null;
    line = Number(esbuildLoc[2]);
    column = Number(esbuildLoc[3]);
    message = (esbuildLoc[4] ?? "").trim();
    if (/could not resolve/i.test(message) && missingPackage === null) {
      const inner = message.match(/"([^"]+)"|'([^']+)'/);
      const spec = inner?.[1] ?? inner?.[2];
      if (spec?.startsWith(".")) missingRelative = spec;
      else if (spec) missingPackage = spec;
    }
  }

  const esbuildShort = text.match(/✘\s*\[ERROR\]\s*(.+)/i);
  if (esbuildShort && !message) message = esbuildShort[1]!.trim();

  const syntaxMatch = text.match(/(SyntaxError:\s*.+)/i);
  if (syntaxMatch) syntaxError = syntaxMatch[1]!.trim();

  if (/config must export or return an object/i.test(text)) {
    invalidExport = true;
    message = message || "config must export or return an object";
  }

  for (const rawLine of lines) {
    if (skipWrapper(rawLine)) continue;

    const errNamed = rawLine.match(
      /^(Error|SyntaxError|TypeError|ReferenceError)(?:\s*\[([^\]]+)\])?:\s*(.+)$/i,
    );
    if (errNamed) {
      name = errNamed[2] ? `${errNamed[1]} [${errNamed[2]}]` : errNamed[1]!;
      message = message || errNamed[3]!.trim();
      continue;
    }

    const locOnly = rawLine.match(
      /^([^\s:]+\.(?:ts|tsx|js|mjs|cjs|mts|cts)):(\d+):(\d+)$/,
    );
    if (locOnly) {
      file = file ?? locOnly[1]!;
      line = line ?? Number(locOnly[2]);
      column = column ?? Number(locOnly[3]);
    }
  }

  if (!message) {
    for (const rawLine of lines) {
      if (skipWrapper(rawLine)) continue;
      if (/^error\b/i.test(rawLine) && rawLine.length > 10) {
        message = rawLine;
        break;
      }
    }
  }

  if (!file && configPath) file = configPath;
  if (!line && configPath) {
    line =
      findLineForImportSpec(configPath, missingPackage) ??
      findLineForImportSpec(configPath, missingRelative);
  }

  if (
    !message &&
    !missingPackage &&
    !missingRelative &&
    !syntaxError &&
    !invalidExport
  ) {
    return null;
  }

  return {
    name,
    message,
    file,
    line,
    column,
    stackTrace,
    missingPackage,
    missingRelative,
    syntaxError,
    invalidExport,
  };
}

export function formatViteConfigRootCause(
  parsed: ParsedViteException,
  configLabel: string,
): string {
  const loc =
    parsed.line !== null
      ? `${configLabel}:${parsed.line}`
      : configLabel;

  if (parsed.missingPackage) {
    return `${loc}\nCannot find package '${parsed.missingPackage}'`;
  }

  if (parsed.missingRelative) {
    return `${configLabel} imports ${parsed.missingRelative} which does not exist`;
  }

  if (parsed.syntaxError) {
    const short = parsed.syntaxError.replace(/^SyntaxError:\s*/i, "SyntaxError: ");
    return `${loc}\n${short}`;
  }

  if (parsed.invalidExport) {
    return `${configLabel}\nInvalid config export — must export or return an object`;
  }

  if (parsed.message) {
    const oneLine = parsed.message.split(/\r?\n/)[0] ?? parsed.message;
    return `${loc}\n${oneLine}`;
  }

  return `${configLabel}\nVite could not load config (see full output)`;
}

export function buildViteConfigDiagnostics(opts: {
  stdout: string;
  stderr: string;
  cwd: string;
}): ViteConfigDiagnosticsPayload | null {
  const fullOutput = `${opts.stdout}\n${opts.stderr}`.trim();
  if (!isViteConfigLoadFailure(fullOutput)) return null;

  const configFilePath =
    extractConfigPathFromOutput(fullOutput, opts.cwd) ??
    findViteConfigOnDisk(opts.cwd);
  const configFileRelative = configFilePath
    ? relativeConfigLabel(configFilePath, opts.cwd)
    : null;

  const importsDiscovered = configFilePath
    ? discoverConfigImports(configFilePath)
    : [];
  const missingImports = configFilePath
    ? findMissingConfigImports(opts.cwd, configFilePath, importsDiscovered)
    : [];

  const syntaxParseResult = configFilePath
    ? basicSyntaxCheck(configFilePath)
    : "config file not found on disk";

  const parsed = parseViteConfigException(
    fullOutput,
    opts.cwd,
    configFilePath,
  );

  const configLabel = configFileRelative ?? "vite.config.ts";
  const rootCauseLine = parsed
    ? formatViteConfigRootCause(parsed, configLabel)
    : missingImports.length > 0
      ? `${configLabel} imports ${missingImports[0]} which does not exist`
      : `${configLabel}\nfailed to load config (see Vite output below)`;

  const firstException = parsed
    ? [parsed.name, parsed.message].filter(Boolean).join(": ") ||
      parsed.syntaxError ||
      null
    : findDeepestErrorLine(fullOutput);

  return {
    configFilePath,
    configFileRelative,
    importsDiscovered,
    missingImports,
    syntaxParseResult,
    firstException,
    exceptionName: parsed?.name ?? null,
    stackTrace: parsed?.stackTrace ?? null,
    rootCauseLine,
    fullOutput,
  };
}

function findDeepestErrorLine(output: string): string | null {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/failed to load config from/i.test(line)) continue;
    if (
      /^(Error|SyntaxError|TypeError|Cannot find|Could not resolve|✘)/i.test(
        line,
      )
    ) {
      return line;
    }
  }
  return null;
}

export function formatViteConfigDiagnosticsText(
  d: ViteConfigDiagnosticsPayload,
): string {
  return [
    "Vite config diagnostics",
    "=====================",
    "",
    `Root cause: ${d.rootCauseLine}`,
    "",
    `Config file: ${d.configFilePath ?? "—"}`,
    `Relative: ${d.configFileRelative ?? "—"}`,
    "",
    "Imports discovered:",
    d.importsDiscovered.length
      ? d.importsDiscovered.map((i) => `  - ${i}`).join("\n")
      : "  (none)",
    "",
    "Missing imports:",
    d.missingImports.length
      ? d.missingImports.map((i) => `  - ${i}`).join("\n")
      : "  (none detected on disk)",
    "",
    `Syntax check: ${d.syntaxParseResult}`,
    "",
    `First exception: ${d.firstException ?? "(none parsed)"}`,
    d.exceptionName ? `Exception type: ${d.exceptionName}` : null,
    "",
    d.stackTrace ? "--- stack trace ---" : null,
    d.stackTrace ?? null,
    "",
    "--- full Vite stdout/stderr ---",
    d.fullOutput || "(empty)",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
