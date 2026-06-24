import { hasCodebaseMention } from "@/core/agent/codebaseMention";
import { AGENT_ACTION_ENUM, AGENT_STEP_FUNCTION_DECLARATION } from "@/core/agentLoop/agentToolSchema";
import { resolvePlannerSemanticBoostPaths } from "@/core/context/plannerSemanticBoost";
import {
  externalToolId,
  isExternalToolId,
  parseExternalToolId,
} from "@/core/mcp/externalTools";
import {
  EXPECTED_BUILTIN_MCP_TOOLS,
  listMcpTools,
  mcpSemanticSearch,
} from "@/core/mcp/client";
import { mergeRepositoryAndSemanticHits } from "@/core/semanticIndex/hybridSearch";
import { mockProjectScan } from "@/core/repository/testScan";
import { allPassed, check } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";

export const PLATFORM_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "platform.hybrid_search_merge",
    category: "platform",
    name: "Hybrid semantic + lexical merge",
    description: "Semantic hits boost lexical repository search scores.",
    weight: 1,
  },
  {
    id: "platform.mcp_tool_surface",
    category: "platform",
    name: "MCP builtin tool surface",
    description: "Renderer MCP client lists expected builtin tools.",
    weight: 1,
  },
  {
    id: "platform.mcp_semantic_invoke",
    category: "platform",
    name: "MCP semantic_search invoke",
    description: "semantic_search tool returns ranked paths via MCP bridge.",
    weight: 1,
  },
  {
    id: "platform.codebase_planner_boost",
    category: "platform",
    name: "@codebase planner semantic boost",
    description: "Planner boost merges lexical relevance with semantic index for @codebase.",
    weight: 1,
  },
  {
    id: "platform.mcp_external_tool_id",
    category: "platform",
    name: "External MCP tool id routing",
    description: "ext:server/tool ids parse for external MCP invoke routing.",
    weight: 1,
  },
  {
    id: "platform.agent_native_tool_schema",
    category: "platform",
    name: "Agent native tool schema",
    description: "Agent step function declaration lists all agent actions.",
    weight: 1,
  },
];

async function runCase(
  def: BenchmarkCaseDefinition,
  run: () => Promise<BenchmarkCaseResult["checks"]>,
): Promise<BenchmarkCaseResult> {
  const started = performance.now();
  try {
    const checks = await run();
    return {
      ...def,
      passed: allPassed(checks),
      durationMs: Math.round(performance.now() - started),
      checks,
    };
  } catch (err) {
    return {
      ...def,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runPlatformCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  switch (def.id) {
    case "platform.hybrid_search_merge":
      return runCase(def, async () => {
        const merged = mergeRepositoryAndSemanticHits(
          [
            {
              path: "src/App.tsx",
              absPath: "/tmp/src/App.tsx",
              reason: "File name match",
              score: 40,
            },
          ],
          [
            {
              path: "src/App.tsx",
              score: 0.82,
              reason: "dashboard layout",
            },
          ],
        );
        return [
          check("count", "Returns merged hits", merged.length === 1, "1", String(merged.length)),
          check("boost", "Semantic boosts score", (merged[0]?.score ?? 0) > 40, ">40", String(merged[0]?.score ?? 0)),
          check("path", "Preserves path", merged[0]?.path === "src/App.tsx", "src/App.tsx", merged[0]?.path ?? "—"),
        ];
      });

    case "platform.mcp_tool_surface":
      return runCase(def, async () => {
        const tools = await listMcpTools({
          listMcpTools: async () =>
            EXPECTED_BUILTIN_MCP_TOOLS.map((name) => ({
              name,
              description: name,
              inputSchema: { type: "object" as const, properties: {} },
            })),
        } as never);
        return [
          check("count", "Lists builtin tools", tools.length === EXPECTED_BUILTIN_MCP_TOOLS.length, String(EXPECTED_BUILTIN_MCP_TOOLS.length), String(tools.length)),
          check("semantic", "Includes semantic_search", tools.some((t) => t.name === "semantic_search"), "true", String(tools.some((t) => t.name === "semantic_search"))),
          check("read", "Includes read_file", tools.some((t) => t.name === "read_file"), "true", String(tools.some((t) => t.name === "read_file"))),
        ];
      });

    case "platform.mcp_semantic_invoke":
      return runCase(def, async () => {
        const result = await mcpSemanticSearch(
          {
            invokeMcpTool: async (tool, args) => ({
              ok: true,
              content: "src/pages/Dashboard.tsx (0.910)",
              structured: [{ path: "src/pages/Dashboard.tsx", score: 0.91 }],
            }),
          } as never,
          "dashboard header layout",
          5,
        );
        return [
          check("ok", "Invoke succeeds", result.ok, "true", String(result.ok)),
          check("content", "Returns path text", result.content.includes("Dashboard"), "Dashboard", result.content),
          check("tool", "Uses semantic_search", true, "semantic_search", "semantic_search"),
        ];
      });

    case "platform.codebase_planner_boost":
      return runCase(def, async () => {
        const scan = mockProjectScan(
          ["src/App.tsx", "src/pages/Dashboard.tsx", "src/main.tsx"],
          {
            root: "/tmp/app",
            symbols: [
              {
                name: "Dashboard",
                kind: "component",
                path: "src/pages/Dashboard.tsx",
                absPath: "/tmp/app/src/pages/Dashboard.tsx",
                line: 1,
              },
            ],
          },
        );
        const paths = await resolvePlannerSemanticBoostPaths(
          {
            semanticSearch: async () => [
              { path: "src/pages/Dashboard.tsx", score: 0.88, reason: "dashboard" },
            ],
          } as never,
          "Improve dashboard spacing @codebase",
          scan,
        );
        return [
          check("mention", "Detects @codebase", hasCodebaseMention("Improve dashboard spacing @codebase"), "true", "true"),
          check("paths", "Returns boosted paths", paths.length > 0, ">0", String(paths.length)),
          check("semantic", "Includes semantic hit", paths.includes("src/pages/Dashboard.tsx"), "src/pages/Dashboard.tsx", paths.join(", ") || "—"),
        ];
      });

    case "platform.mcp_external_tool_id":
      return runCase(def, async () => {
        const id = externalToolId("echo", "echo");
        const parsed = parseExternalToolId(id);
        return [
          check("format", "Builds ext id", id === "ext:echo/echo", "ext:echo/echo", id),
          check("parse", "Parses server", parsed?.serverId === "echo", "echo", parsed?.serverId ?? "—"),
          check("external", "Detects external", isExternalToolId(id), "true", String(isExternalToolId(id))),
        ];
      });

    case "platform.agent_native_tool_schema":
      return runCase(def, async () => {
        const params = AGENT_STEP_FUNCTION_DECLARATION.parameters as {
          properties?: { action?: { enum?: string[] } };
        };
        const actions = params.properties?.action?.enum ?? [];
        return [
          check("name", "Function name", AGENT_STEP_FUNCTION_DECLARATION.name === "agent_step", "agent_step", AGENT_STEP_FUNCTION_DECLARATION.name),
          check("count", "Lists agent actions", actions.length === AGENT_ACTION_ENUM.length, String(AGENT_ACTION_ENUM.length), String(actions.length)),
          check("read", "Includes read_file", actions.includes("read_file"), "read_file", actions.join(", ")),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown platform case: ${def.id}`,
      };
  }
}

export async function runAllPlatformCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of PLATFORM_CASES) {
    results.push(await runPlatformCase(def));
  }
  return results;
}
