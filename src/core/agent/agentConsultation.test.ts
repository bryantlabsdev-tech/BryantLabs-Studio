import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASK_MODE_READONLY_EXPLANATION } from "@/core/agent/askMode";
import {
  isStaleConsultationTurn,
  resolveConsultationExecution,
  runAgentCommandIntent,
  runAgentConsultation,
} from "@/core/agent/agentConsultation";
import type { BryantLabsApi } from "@/types";
import type { ProviderSettings } from "@/core/providers/types";

const MUTATION_CAPABLE_API_METHODS = [
  "applyEdit",
  "createProjectFile",
  "deleteProjectFile",
  "replaceUndoBatch",
  "undoLastEdit",
  "stageShadowRun",
  "discardShadowRun",
  "verify",
  "invokeMcpTool",
  "executeAgentInspect",
  "prepareProjectCodeExecution",
  "approveProjectCodeExecution",
  "executeApprovedProjectCode",
  "confirmProjectCodeExecution",
  "preparePackageScriptExecution",
  "approvePackageScriptExecution",
  "executeApprovedPackageScript",
  "confirmPackageScriptExecution",
  "terminalWrite",
  "terminalCreate",
  "greenfieldWrite",
  "greenfieldGenerate",
  "greenfieldGenerateRaw",
  "greenfieldClearFolder",
  "greenfieldSetup",
  "greenfieldBuild",
  "planWithProvider",
  "agentStepWithProvider",
  "proposePatch",
] as const;

function mockApi(opts?: {
  readonly testProvider?: () => Promise<{
    ok: boolean;
    text?: string;
    error?: string;
    model?: string;
  }>;
}): BryantLabsApi & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const api = new Proxy(
    {
      calls,
      getProviderSettings: async () => {
        calls.getProviderSettings = (calls.getProviderSettings ?? 0) + 1;
        return {
          provider: "gemini",
          geminiModel: "gemini-2.5-flash",
        } as ProviderSettings;
      },
      testProvider: async () => {
        calls.testProvider = (calls.testProvider ?? 0) + 1;
        if (opts?.testProvider) return opts.testProvider();
        return {
          ok: true,
          text: "Here is an explanation of App.tsx.",
          model: "mock-deterministic",
        };
      },
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        if (typeof prop !== "string") return undefined;
        return async () => {
          calls[prop] = (calls[prop] ?? 0) + 1;
          return { ok: true };
        };
      },
    },
  );
  return api as unknown as BryantLabsApi & { calls: Record<string, number> };
}

function assertNoMutationApiCalls(calls: Record<string, number>): void {
  for (const method of MUTATION_CAPABLE_API_METHODS) {
    assert.equal(calls[method] ?? 0, 0, method);
  }
}

describe("Ask mode consultation does not mutate", () => {
  it("does not call any mutation-capable API during Ask consultation", async () => {
    const api = mockApi();
    const result = await runAgentConsultation({
      api,
      projectPath: "/tmp/app",
      prompt: "Edit App.tsx and add a timer",
      intent: "ask",
      askMode: true,
      projectRules: "",
    });
    assert.equal(result.ok, true);
    assert.match(result.text, /read-only/i);
    assert.equal(api.calls.testProvider, 1);
    assertNoMutationApiCalls(api.calls);
  });

  it("does not execute terminal, verify, or writes from Ask command intent", async () => {
    const api = mockApi();
    const result = await runAgentCommandIntent({
      api,
      projectPath: "/tmp/app",
      prompt: "Run the build",
      intent: "run",
      askMode: true,
    });
    assert.equal(result.ok, true);
    assert.ok(result.text.includes(ASK_MODE_READONLY_EXPLANATION));
    assert.equal(api.calls.testProvider ?? 0, 0);
    assertNoMutationApiCalls(api.calls);
  });

  it("Ask forces consultation even when command is requested", () => {
    assert.equal(
      resolveConsultationExecution({ askMode: true, command: true }),
      "consultation",
    );
    assert.equal(resolveConsultationExecution({ command: true }), "command");
    assert.equal(resolveConsultationExecution({}), "consultation");
  });

  it("drops stale consultation turns after cancel or project switch", () => {
    assert.equal(
      isStaleConsultationTurn({
        generation: 1,
        currentGeneration: 2,
        startedProjectPath: "/tmp/a",
        currentProjectPath: "/tmp/a",
      }),
      true,
    );
    assert.equal(
      isStaleConsultationTurn({
        generation: 1,
        currentGeneration: 1,
        startedProjectPath: "/tmp/a",
        currentProjectPath: "/tmp/b",
      }),
      true,
    );
    assert.equal(
      isStaleConsultationTurn({
        generation: 1,
        currentGeneration: 1,
        startedProjectPath: "/tmp/a",
        currentProjectPath: "/tmp/a",
      }),
      false,
    );
  });

  it("returns a failure for empty consultation responses", async () => {
    const api = mockApi({
      testProvider: async () => ({ ok: true, text: "   ", model: "mock-deterministic" }),
    });
    const result = await runAgentConsultation({
      api,
      projectPath: "/tmp/app",
      prompt: "What does App.tsx do?",
      intent: "ask",
      askMode: true,
      projectRules: "",
    });
    assert.equal(result.ok, false);
    assert.equal(result.text, "");
    assertNoMutationApiCalls(api.calls);
  });
});
