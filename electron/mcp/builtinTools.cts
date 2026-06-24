import * as path from "node:path";
import type { McpHostContext } from "./context.cjs";

/** Tool definitions mirrored in renderer types (src/core/mcp/types.ts). */
export const BUILTIN_TOOL_DEFINITIONS = [
  {
    name: "read_file",
    description: "Read a text file inside the open project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "Relative or absolute project path" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description: "List files and folders under a project directory.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description: "Directory path (defaults to project root)",
        },
      },
    },
  },
  {
    name: "scan_project",
    description: "Rescan the project tree and rebuild the code index.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "git_status",
    description: "Return git branch and porcelain status for the open project.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "verify_project",
    description: "Run TypeScript check and project build verification.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "semantic_search",
    description: "Search project source by meaning using the local semantic index (TF-IDF).",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Natural language or keyword query" },
        limit: { type: "number" as const, description: "Max hits (default 12)" },
      },
      required: ["query"],
    },
  },
] as const;

export type BuiltinToolName = (typeof BUILTIN_TOOL_DEFINITIONS)[number]["name"];

export interface McpToolResult {
  ok: boolean;
  content: string;
  structured?: unknown;
  error?: string;
}

function resolveProjectPath(
  ctx: McpHostContext,
  input: string,
): { ok: true; abs: string } | { ok: false; error: string } {
  const root = ctx.getProjectRoot();
  if (!root) return { ok: false, error: "No project is open." };
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Path is required." };
  const abs = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(root, trimmed);
  if (!ctx.isWithinProject(abs)) {
    return { ok: false, error: "Path is outside the project." };
  }
  return { ok: true, abs };
}

export async function invokeBuiltinTool(
  ctx: McpHostContext,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<McpToolResult> {
  switch (tool as BuiltinToolName) {
    case "read_file": {
      const rel = String(args.path ?? "");
      const resolved = resolveProjectPath(ctx, rel);
      if (!resolved.ok) return { ok: false, content: "", error: resolved.error };
      const file = await ctx.readFile(resolved.abs);
      if (!file.readable) {
        return { ok: false, content: "", error: file.reason ?? "Unreadable file." };
      }
      return {
        ok: true,
        content: file.content.slice(0, 8000),
        structured: { path: rel, bytes: file.content.length },
      };
    }

    case "list_directory": {
      const root = ctx.getProjectRoot();
      if (!root) return { ok: false, content: "", error: "No project is open." };
      const dirArg = args.path;
      const dir =
        typeof dirArg === "string" && dirArg.trim().length > 0
          ? resolveProjectPath(ctx, dirArg)
          : { ok: true as const, abs: root };
      if (!dir.ok) return { ok: false, content: "", error: dir.error };
      const nodes = await ctx.listDirectory(dir.abs);
      const lines = nodes.map((n) => `${n.type}\t${n.path}`).join("\n");
      return { ok: true, content: lines, structured: nodes };
    }

    case "scan_project": {
      const scan = await ctx.scanProject();
      if (!scan) return { ok: false, content: "", error: "Scan failed." };
      return {
        ok: true,
        content: `Scanned ${scan.summary.totalFiles} files (${scan.symbols.length} symbols).`,
        structured: {
          files: scan.summary.totalFiles,
          symbols: scan.symbols.length,
          framework: scan.summary.framework,
        },
      };
    }

    case "git_status": {
      const status = await ctx.getGitStatus();
      return { ok: true, content: JSON.stringify(status, null, 2), structured: status };
    }

    case "verify_project": {
      const result = await ctx.runVerification();
      const text = JSON.stringify(result, null, 2);
      const ok =
        typeof result === "object" &&
        result !== null &&
        "ok" in result &&
        Boolean((result as { ok?: boolean }).ok);
      return { ok, content: text, structured: result };
    }

    case "semantic_search": {
      const query = String(args.query ?? "").trim();
      if (!query) return { ok: false, content: "", error: "query is required." };
      const limit =
        typeof args.limit === "number" && args.limit > 0
          ? Math.min(50, Math.floor(args.limit))
          : 12;
      const hits = ctx.semanticSearch(query, limit);
      const lines = hits
        .map(
          (h) =>
            `${(h as { path: string }).path} (${((h as { score: number }).score).toFixed(3)})`,
        )
        .join("\n");
      return {
        ok: hits.length > 0,
        content: lines || "No semantic hits.",
        structured: hits,
      };
    }

    default:
      return { ok: false, content: "", error: `Unknown tool: ${tool}` };
  }
}
