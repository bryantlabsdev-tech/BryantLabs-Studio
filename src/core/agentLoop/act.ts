import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";
import type {
  AgentActionParams,
  AgentActionType,
  AgentActResult,
  AgentLoopSession,
} from "@/core/agentLoop/types";
import {
  appendObservation,
  patchAgentFlags,
} from "@/core/agentLoop/state";
import { activateTask, setTaskStatus } from "@/core/agentLoop/planner";
import type { RepositorySearchHit } from "@/core/repository/types";
import type { SymbolReferenceInfo } from "@/core/repository/types";

export interface AgentActCallbacks {
  searchFiles(query: string): Promise<RepositorySearchHit[]>;
  grepContent(query: string): Promise<{
    ok: boolean;
    hits: { path: string; line: number; text: string }[];
    error?: string;
  }>;
  searchSymbols(query: string): Promise<RepositorySearchHit[]>;
  findReferences(symbol: string): SymbolReferenceInfo[];
  readFile(relPath: string): Promise<{ ok: boolean; preview: string }>;
  createPlan(goal: string): Promise<{
    ok: boolean;
    fileCount: number;
    newFileCount: number;
    paths: string[];
    error?: string;
    needsApproval?: boolean;
  }>;
  modifyFiles(): Promise<{
    ok: boolean;
    filesModified: string[];
    error?: string;
  }>;
  runVerification(): Promise<{ ok: boolean; summary: string }>;
  runAutoFix(): Promise<{ ok: boolean; summary: string }>;
  runCommand(command: string): Promise<{
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    error?: string;
  }>;
  invokeMcpTool(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; content: string; error?: string }>;
}

export async function executeAgentAction(
  session: AgentLoopSession,
  action: AgentActionType,
  params: AgentActionParams,
  callbacks: AgentActCallbacks,
): Promise<{ session: AgentLoopSession; result: AgentActResult }> {
  let next = session;

  switch (action) {
    case "grep_content": {
      const query = params.query?.trim() ?? "";
      const out = await callbacks.grepContent(query);
      next = patchAgentFlags(next, {
        grepQueries: [...next.flags.grepQueries, query],
      });
      const lines = out.hits
        .slice(0, 12)
        .map((h) => `${h.path}:${h.line} ${h.text.trim()}`)
        .join("; ");
      return {
        session: appendObservation(
          next,
          out.ok
            ? `Grep "${query}": ${lines || "no matches"}`
            : `Grep "${query}" failed: ${out.error ?? "unknown"}`,
        ),
        result: {
          ok: out.ok && out.hits.length > 0,
          observation: out.ok
            ? out.hits.length
              ? `Grep found ${out.hits.length} match(es) for "${query}".`
              : `Grep found no matches for "${query}".`
            : (out.error ?? "Grep failed."),
        },
      };
    }

    case "search_files": {
      const query = params.query?.trim() ?? "";
      const hits = await callbacks.searchFiles(query);
      const lines = hits
        .slice(0, 8)
        .map((h) => `${h.path} (${h.reason})`)
        .join("; ");
      next = patchAgentFlags(next, {
        searchedTerms: [...next.flags.searchedTerms, query],
        symbolHits: hits.length ? hits : next.flags.symbolHits,
      });
      next = {
        ...next,
        dynamicTasks: activateTask(next.dynamicTasks, "Search"),
      };
      next = {
        ...next,
        dynamicTasks: setTaskStatus(next.dynamicTasks, "Search", "done"),
      };
      return {
        session: appendObservation(
          next,
          hits.length
            ? `File search "${query}": ${lines}`
            : `File search "${query}": no hits`,
        ),
        result: {
          ok: hits.length > 0,
          observation: hits.length
            ? `Found ${hits.length} file(s) for "${query}".`
            : `No files matched "${query}".`,
        },
      };
    }

    case "search_symbols": {
      const query = params.query?.trim() ?? "";
      const hits = await callbacks.searchSymbols(query);
      const lines = hits
        .slice(0, 8)
        .map((h) =>
          h.symbolName
            ? `${h.symbolName} @ ${h.path}`
            : `${h.path} (${h.reason})`,
        )
        .join("; ");
      next = patchAgentFlags(next, {
        searchedTerms: [...next.flags.searchedTerms, query],
        symbolHits: hits.length ? hits : next.flags.symbolHits,
      });
      next = {
        ...next,
        dynamicTasks: activateTask(next.dynamicTasks, "Explore"),
      };
      return {
        session: appendObservation(
          next,
          hits.length
            ? `Symbol search "${query}": ${lines}`
            : `Symbol search "${query}": no hits`,
        ),
        result: {
          ok: hits.length > 0,
          observation: hits.length
            ? `Found ${hits.length} symbol/file hit(s).`
            : `No symbols matched "${query}".`,
        },
      };
    }

    case "read_file": {
      const path = params.path?.trim() ?? "";
      const { ok, preview } = await callbacks.readFile(path);
      const readPaths = ok
        ? [...next.flags.readPaths, path]
        : next.flags.readPaths;
      const readFileContents = ok
        ? { ...next.flags.readFileContents, [path]: preview }
        : next.flags.readFileContents;
      next = patchAgentFlags(next, { readPaths, readFileContents });
      return {
        session: appendObservation(
          next,
          ok
            ? `Read ${path}: ${preview.slice(0, 400)}`
            : `Read ${path}: failed`,
        ),
        result: {
          ok,
          observation: ok
            ? `Read ${path} (${preview.length} chars preview).`
            : `Could not read ${path}.`,
        },
      };
    }

    case "find_references": {
      const symbol = params.symbol?.trim() ?? "";
      const refs = callbacks.findReferences(symbol);
      const lines = refs
        .slice(0, 6)
        .map((r) => `${r.name} in ${r.definedIn} → ${r.usedIn.slice(0, 3).join(", ")}`)
        .join("; ");
      next = patchAgentFlags(next, {
        referenceSymbol: symbol,
      });
      next = {
        ...next,
        dynamicTasks: activateTask(next.dynamicTasks, "Trace"),
      };
      return {
        session: appendObservation(
          next,
          refs.length
            ? `References to ${symbol}: ${lines}`
            : `References to ${symbol}: none`,
        ),
        result: {
          ok: refs.length > 0,
          observation: refs.length
            ? `Found ${refs.length} reference(s) to ${symbol}.`
            : `No references for ${symbol}.`,
        },
      };
    }

    case "run_command": {
      const command = params.command?.trim() ?? "";
      const allowed = validateAgentCommand(command);
      if (!allowed.ok) {
        return {
          session: appendObservation(next, `Command blocked: ${allowed.error}`),
          result: {
            ok: false,
            observation: allowed.error,
          },
        };
      }
      const out = await callbacks.runCommand(command);
      const preview = [out.stdout, out.stderr]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000);
      next = patchAgentFlags(next, {
        commandsRun: [...next.flags.commandsRun, command],
      });
      return {
        session: appendObservation(
          next,
          out.ok
            ? `Command "${command}" exit ${out.exitCode}: ${preview.slice(0, 400)}`
            : `Command "${command}" failed: ${out.error ?? preview.slice(0, 400)}`,
        ),
        result: {
          ok: out.ok,
          observation: out.ok
            ? `Command succeeded (exit ${out.exitCode}).`
            : (out.error ?? `Command failed (exit ${out.exitCode}).`),
        },
      };
    }

    case "invoke_mcp_tool": {
      const tool = params.tool?.trim() ?? params.query?.trim() ?? "";
      let args: Record<string, unknown> = {};
      if (params.argsJson?.trim()) {
        try {
          const parsed = JSON.parse(params.argsJson) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          return {
            session: appendObservation(next, `MCP args JSON invalid for ${tool}`),
            result: { ok: false, observation: "Invalid MCP args JSON." },
          };
        }
      }
      const out = await callbacks.invokeMcpTool(tool, args);
      next = patchAgentFlags(next, {
        mcpToolsInvoked: [...next.flags.mcpToolsInvoked, tool],
      });
      const preview = out.content.slice(0, 2000);
      return {
        session: appendObservation(
          next,
          out.ok
            ? `MCP ${tool}: ${preview.slice(0, 400)}`
            : `MCP ${tool} failed: ${out.error ?? "unknown"}`,
        ),
        result: {
          ok: out.ok,
          observation: out.ok
            ? `MCP tool ${tool} returned ${out.content.length} chars.`
            : (out.error ?? `MCP tool ${tool} failed.`),
        },
      };
    }

    case "create_plan": {
      const out = await callbacks.createPlan(next.goal);
      const planOk = out.ok && !out.needsApproval;
      next = patchAgentFlags(next, {
        planCreated: planOk,
        planAttempts: planOk ? next.flags.planAttempts : next.flags.planAttempts + 1,
        planLastError: planOk ? null : (out.error ?? "Plan creation failed."),
        plannedFileCount: out.fileCount,
        plannedNewFileCount: out.newFileCount,
      });
      next = {
        ...next,
        dynamicTasks: activateTask(next.dynamicTasks, "Plan"),
      };
      if (out.ok) {
        next = {
          ...next,
          dynamicTasks: setTaskStatus(next.dynamicTasks, "Plan", "done"),
        };
      }
      return {
        session: appendObservation(
          next,
          out.needsApproval
            ? `Plan needs approval: ${out.newFileCount} new file(s)`
            : out.ok
              ? `Plan: ${out.fileCount} file(s), ${out.newFileCount} new`
              : `Plan failed: ${out.error ?? "unknown"}`,
        ),
        result: {
          ok: out.ok && !out.needsApproval,
          observation: out.needsApproval
            ? (out.error ?? "Plan requires approval.")
            : out.ok
              ? `AI plan with ${out.fileCount} file(s).`
              : (out.error ?? "Plan creation failed."),
          ...(out.needsApproval
            ? {
                needsApproval: true,
                approvalSummary: out.error ?? "Plan requires approval.",
              }
            : {}),
        },
      };
    }

    case "modify_files": {
      const out = await callbacks.modifyFiles();
      const approval = Boolean(
        !out.ok && out.error?.toLowerCase().includes("approval"),
      );
      next = patchAgentFlags(next, {
        executionDone: out.ok,
      });
      next = {
        ...next,
        dynamicTasks: activateTask(next.dynamicTasks, "Apply"),
      };
      return {
        session: appendObservation(
          next,
          out.ok
            ? `Execution modified: ${out.filesModified.join(", ")}`
            : `Execution failed: ${out.error ?? "unknown"}`,
        ),
        result: {
          ok: out.ok,
          observation: out.ok
            ? `Modified ${out.filesModified.length} file(s).`
            : (out.error ?? "Multi-file execution failed."),
          ...(approval
            ? {
                needsApproval: true,
                approvalSummary: out.error ?? "Execution requires approval.",
              }
            : {}),
        },
      };
    }

    case "run_verification": {
      const out = await callbacks.runVerification();
      next = patchAgentFlags(next, {
        lastVerificationOk: out.ok,
      });
      next = {
        ...next,
        dynamicTasks: activateTask(next.dynamicTasks, "Verify"),
      };
      if (next.mode === "investigation" && !out.ok) {
        next = patchAgentFlags(next, {
          rootCause: out.summary,
        });
      }
      return {
        session: appendObservation(next, `Verification: ${out.summary}`),
        result: {
          ok: out.ok,
          observation: out.summary,
        },
      };
    }

    case "run_auto_fix": {
      const out = await callbacks.runAutoFix();
      next = patchAgentFlags(next, {
        autoFixAttempts: next.flags.autoFixAttempts + 1,
        lastVerificationOk: out.ok ? true : next.flags.lastVerificationOk,
      });
      return {
        session: appendObservation(next, `Auto Fix: ${out.summary}`),
        result: {
          ok: out.ok,
          observation: out.summary,
        },
      };
    }

    case "request_user_input": {
      return {
        session: appendObservation(
          next,
          params.message ?? "Waiting for user input.",
        ),
        result: {
          ok: true,
          observation: params.message ?? "Paused for user input.",
        },
      };
    }

    case "complete_task": {
      const summary = params.message ?? "Task complete.";
      const investigation = next.mode === "investigation";
      next = patchAgentFlags(next, {
        completionSummary: summary,
        investigationComplete: investigation,
        rootCause: investigation ? summary : next.flags.rootCause,
      });
      return {
        session: appendObservation(next, `Complete: ${summary}`),
        result: {
          ok: true,
          observation: summary,
          done: true,
        },
      };
    }

    default:
      return {
        session: next,
        result: { ok: false, observation: `Unknown action: ${action}` },
      };
  }
}
