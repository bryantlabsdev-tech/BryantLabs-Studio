import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyAgentPromptIntent,
  intentEntersApplyPlan,
  intentIsConsultation,
  looksLikeApplyConfirmation,
  MIXED_EDIT_CONFIRM_QUESTION,
} from "@/core/agent/agentIntentRouter";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";

describe("classifyAgentPromptIntent", () => {
  it("classifies explain prompts", () => {
    const result = classifyAgentPromptIntent("Explain how authentication works");
    assert.equal(result.intent, "explain");
    assert.equal(result.mixedEdit, false);
  });

  it("classifies review prompts", () => {
    const result = classifyAgentPromptIntent("Review the codebase and suggest improvements");
    assert.equal(result.intent, "review");
    assert.equal(intentIsConsultation(result.intent), true);
  });

  it("classifies analyze prompts", () => {
    const result = classifyAgentPromptIntent("Analyze the project architecture");
    assert.equal(result.intent, "analyze");
  });

  it("classifies search prompts", () => {
    const result = classifyAgentPromptIntent("Find where routing is handled");
    assert.equal(result.intent, "search");
  });

  it("classifies ask/question prompts", () => {
    const result = classifyAgentPromptIntent("What does App.tsx do?");
    assert.equal(result.intent, "ask");
    assert.equal(intentEntersApplyPlan(result.intent), false);
  });

  it("classifies edit prompts", () => {
    const result = classifyAgentPromptIntent("Add a timer to the board");
    assert.equal(result.intent, "edit");
    assert.equal(intentEntersApplyPlan(result.intent), true);
  });

  it("classifies refactor prompts", () => {
    const result = classifyAgentPromptIntent("Refactor the auth module");
    assert.equal(result.intent, "refactor");
    assert.equal(intentEntersApplyPlan(result.intent), true);
  });

  it("classifies generate prompts", () => {
    const result = classifyAgentPromptIntent("Generate a utility for date formatting");
    assert.equal(result.intent, "generate");
    assert.equal(intentEntersApplyPlan(result.intent), true);
  });

  it("classifies run prompts", () => {
    const result = classifyAgentPromptIntent("Run the build");
    assert.equal(result.intent, "run");
    assert.equal(intentEntersApplyPlan(result.intent), false);
  });

  it("classifies terminal prompts", () => {
    const result = classifyAgentPromptIntent("Run npm test in the terminal");
    assert.equal(result.intent, "terminal");
  });

  it("detects mixed explain and edit prompts", () => {
    const result = classifyAgentPromptIntent("Explain this code and simplify it");
    assert.equal(result.mixedEdit, true);
    assert.equal(result.intent, "explain");
    assert.equal(intentEntersApplyPlan(result.intent), false);
  });

  it("detects apply confirmation replies", () => {
    assert.equal(looksLikeApplyConfirmation("yes"), true);
    assert.equal(looksLikeApplyConfirmation("Apply"), true);
    assert.equal(looksLikeApplyConfirmation("Add a timer"), false);
  });

  it("exports mixed edit confirmation question", () => {
    assert.match(MIXED_EDIT_CONFIRM_QUESTION, /apply these changes/i);
  });
});

describe("routeAgentPrompt intent routing", () => {
  const scan = mockProjectScan(["package.json", "src/App.tsx"]);

  it("routes questions to consultation without apply plan", () => {
    const route = routeAgentPrompt({
      prompt: "What does App.tsx do?",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "consultation");
    assert.equal(route.promptIntent, "ask");
  });

  it("routes explain prompts to consultation", () => {
    const route = routeAgentPrompt({
      prompt: "Explain how the router works",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "consultation");
    assert.equal(route.promptIntent, "explain");
  });

  it("routes mixed explain+edit to mixed_confirm", () => {
    const route = routeAgentPrompt({
      prompt: "Explain this code and simplify it",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "mixed_confirm");
    assert.equal(route.mixedEdit, true);
    assert.equal(route.promptIntent, "explain");
  });

  it("routes edit prompts to build_loop", () => {
    const route = routeAgentPrompt({
      prompt: "Add a timer and difficulty levels",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "build_loop");
    assert.equal(route.promptIntent, "edit");
  });

  it("routes refactor prompts to build_loop", () => {
    const route = routeAgentPrompt({
      prompt: "Refactor the state management",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "build_loop");
    assert.equal(route.promptIntent, "refactor");
  });

  it("routes generate prompts to build_loop", () => {
    const route = routeAgentPrompt({
      prompt: "Generate a new settings panel component",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "build_loop");
    assert.equal(route.promptIntent, "generate");
  });

  it("routes audit/analyze prompts to consultation", () => {
    const route = routeAgentPrompt({
      prompt: "Audit the codebase for issues",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "consultation");
    assert.equal(route.promptIntent, "analyze");
  });

  it("routes run prompts to run_command", () => {
    const route = routeAgentPrompt({
      prompt: "Run the build",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "run_command");
    assert.equal(route.promptIntent, "run");
  });

  it("routes terminal prompts to run_command", () => {
    const route = routeAgentPrompt({
      prompt: "npm run test",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "run_command");
    assert.equal(route.promptIntent, "terminal");
  });

  it("still routes repair prompts to build_loop", () => {
    const route = routeAgentPrompt({
      prompt: "Fix TypeScript errors",
      projectOpen: true,
      scan,
      scanStatus: "done",
    });
    assert.equal(route.execution, "build_loop");
    assert.equal(route.intent, "repair");
  });

  it("routes UI mutation commands targeting a page or component to build_loop", () => {
    for (const prompt of [
      "Highlight low-stock products on the products page.",
      "Display low-stock badges on the products page.",
      "Show low-stock warnings on the alerts page.",
      "Add a filter to the products page.",
      "Update the header component.",
      "Change the dashboard page title.",
    ]) {
      const classified = classifyAgentPromptIntent(prompt);
      assert.equal(classified.intent, "edit", prompt);
      const route = routeAgentPrompt({
        prompt,
        projectOpen: true,
        scan,
        scanStatus: "done",
      });
      assert.equal(route.execution, "build_loop", prompt);
    }
  });

  it("keeps questions and advice about UI as consultation", () => {
    for (const prompt of [
      "What does the products page do?",
      "How should I highlight low-stock products?",
      "Should we show low-stock warnings on the products page?",
      "Explain how the products page works",
      "Show me how the products page works",
      "Can you explain the products component?",
    ]) {
      const classified = classifyAgentPromptIntent(prompt);
      assert.equal(intentIsConsultation(classified.intent), true, prompt);
      assert.equal(intentEntersApplyPlan(classified.intent), false, prompt);
      const route = routeAgentPrompt({
        prompt,
        projectOpen: true,
        scan,
        scanStatus: "done",
      });
      assert.equal(route.execution, "consultation", prompt);
    }
  });
});
