/** Strip JSONC comments for tsconfig parsing. */
export function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      const start = i;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      out += text.slice(start, i);
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

export interface ParsedTsCompilerOptions {
  readonly target?: number;
  readonly module?: number;
  readonly jsx?: number;
  readonly strict?: boolean;
  readonly noEmit?: boolean;
  readonly moduleResolution?: number;
  readonly allowJs?: boolean;
  readonly esModuleInterop?: boolean;
  readonly skipLibCheck?: boolean;
  readonly baseUrl?: string;
  readonly paths?: Record<string, string[]>;
}

export function parseTsconfigCompilerOptions(
  raw: string,
): ParsedTsCompilerOptions | null {
  try {
    const parsed = JSON.parse(stripJsonComments(raw)) as {
      compilerOptions?: Record<string, unknown>;
    };
    const co = parsed.compilerOptions;
    if (!co || typeof co !== "object") return null;
    return {
      ...(typeof co.strict === "boolean" ? { strict: co.strict } : {}),
      ...(typeof co.noEmit === "boolean" ? { noEmit: co.noEmit } : {}),
      ...(typeof co.allowJs === "boolean" ? { allowJs: co.allowJs } : {}),
      ...(typeof co.esModuleInterop === "boolean"
        ? { esModuleInterop: co.esModuleInterop }
        : {}),
      ...(typeof co.skipLibCheck === "boolean"
        ? { skipLibCheck: co.skipLibCheck }
        : {}),
      ...(typeof co.baseUrl === "string" ? { baseUrl: co.baseUrl } : {}),
      ...(co.paths && typeof co.paths === "object"
        ? { paths: co.paths as Record<string, string[]> }
        : {}),
    };
  } catch {
    return null;
  }
}
