import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentStepPrompt,
  createLlmDecideNextAction,
  parseAgentStepPayload,
  parseAgentStepResponse,
} from "@/core/agentLoop/llmReasoning";
import { decideNextAction } from "@/core/agentLoop/reasoning";
import { createAgentLoopSession } from "@/core/agentLoop/state";

describe("buildAgentStepPrompt", () => {
  it("includes goal and available tools", () => {
    const session = createAgentLoopSession("Add a timer to Sudoku");
    const prompt = buildAgentStepPrompt(session);
    assert.match(prompt, /Add a timer to Sudoku/);
    assert.match(prompt, /search_symbols/);
    assert.match(prompt, /create_plan/);
  });
});

describe("parseAgentStepResponse", () => {
  it("parses fenced JSON tool selection", () => {
    const parsed = parseAgentStepResponse(`\`\`\`json
{
  "thought": "Need App.tsx",
  "reason": "UI change",
  "action": "read_file",
  "params": { "path": "src/App.tsx" },
  "actionDetail": "ReadFile(\\"src/App.tsx\\")"
}
\`\`\``);
    assert.ok(parsed);
    assert.equal(parsed?.action, "read_file");
    assert.equal(parsed?.params.path, "src/App.tsx");
  });

  it("rejects unknown actions", () => {
    assert.equal(
      parseAgentStepResponse('{"action":"delete_repo","params":{}}'),
      null,
    );
  });
});

describe("createLlmDecideNextAction", () => {
  it("uses provider response when valid", async () => {
    const decide = createLlmDecideNextAction(async () => ({
      ok: true,
      text: JSON.stringify({
        thought: "Search timer hook",
        reason: "Locate existing timer code",
        action: "search_symbols",
        params: { query: "timer" },
        actionDetail: 'SearchSymbols("timer")',
      }),
    }));
    const session = createAgentLoopSession("Add timer");
    const next = await decide(session);
    assert.equal(next.action, "search_symbols");
    assert.equal(next.params.query, "timer");
  });

  it("uses native function-call args when provided", async () => {
    const decide = createLlmDecideNextAction(async () => ({
      ok: true,
      text: "",
      nativeArgs: {
        thought: "Read UI",
        reason: "Native tool call",
        action: "read_file",
        params: { path: "src/App.tsx" },
        actionDetail: 'ReadFile("src/App.tsx")',
      },
    }));
    const next = await decide(createAgentLoopSession("Fix layout"));
    assert.equal(next.action, "read_file");
    assert.equal(next.params.path, "src/App.tsx");
  });

  it("parseAgentStepPayload handles objects", () => {
    const parsed = parseAgentStepPayload({
      thought: "Verify",
      reason: "Check build",
      action: "run_verification",
      params: {},
      actionDetail: "RunVerification",
    });
    assert.equal(parsed?.action, "run_verification");
  });

  it("falls back to rules when provider fails", async () => {
    const session = createAgentLoopSession("Add achievements modal");
    const rules = decideNextAction(session);
    const decide = createLlmDecideNextAction(async () => ({
      ok: false,
      text: "",
      error: "offline",
    }));
    const next = await decide(session);
    assert.equal(next.action, rules.action);
  });
});
