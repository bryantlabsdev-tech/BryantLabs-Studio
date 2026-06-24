import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyAgentWorkspaceSession } from "@/core/agentWorkspace/store";
import {
  formatAgentCopySection,
  formatAgentErrorsCopy,
} from "@/core/agentWorkspace/export";
import { redactSecrets } from "@/core/agentWorkspace/redact";

describe("agent export", () => {
  const ctx = {
    projectPath: "/tmp/demo-app",
    agentSession: {
      ...emptyAgentWorkspaceSession(),
      status: "active" as const,
      context: {
        goal: "Fix calculator UI",
        phase: "execution",
        task: "Plan",
        file: "src/App.tsx",
        model: "gemini · gemini-2.0",
        tokens: null,
      },
      reasoning: [
        {
          id: "r1",
          thought: "Check App.tsx",
          reason: "Entry component",
          action: "read_file",
          result: "ok",
          ok: true,
          at: Date.now(),
        },
      ],
    },
    agentLoopSession: null,
    agentLoopError: null,
    provider: "gemini",
    model: "gemini-2.0",
    lastPlanPrompt: "Polish calculator",
    planSummary: "UI polish plan",
    verification: null,
    failureReport: null,
  };

  it("live run copy includes goal and status", () => {
    const text = formatAgentCopySection(ctx, "live_run");
    assert.match(text, /Fix calculator UI/);
    assert.match(text, /active/);
    assert.match(text, /Dynamic plan/);
  });

  it("reasoning copy includes thought and action labels", () => {
    const text = formatAgentCopySection(ctx, "reasoning");
    assert.match(text, /Thought/);
    assert.match(text, /Check App\.tsx/);
    assert.match(text, /read_file/);
  });

  it("full report includes project path and duration", () => {
    const text = formatAgentCopySection(ctx, "full_report");
    assert.match(text, /\/tmp\/demo-app/);
    assert.match(text, /Polish calculator/);
  });

  it("redacts api keys from copied text", () => {
    const raw = 'api_key="sk-abcdefghijklmnopqrstuvwxyz123456"';
    const redacted = redactSecrets(raw);
    assert.ok(!redacted.includes("sk-abcdefghijklmnopqrstuvwxyz"));
    assert.match(redacted, /REDACTED/);
  });

  it("errors copy surfaces session error", () => {
    const text = formatAgentErrorsCopy({
      ...ctx,
      agentLoopError: "Repository index is not ready yet.",
    });
    assert.match(text, /Repository index is not ready/);
  });
});
