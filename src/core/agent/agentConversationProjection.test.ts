import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentConversationProjection,
  narrativeTargetText,
} from "@/core/agent/agentConversationProjection";
import type { AgentToolEvent } from "@/core/agent/agentToolStream";
import type { AgentRunFinalSummary } from "@/core/agent/agentLiveActivityTimeline";
import { pickWaitObservation } from "@/core/agent/agentExecutionCopy";

function tool(
  overrides: Partial<AgentToolEvent> & Pick<AgentToolEvent, "id" | "kind" | "label" | "status">,
): AgentToolEvent {
  return {
    at: Date.now(),
    ...overrides,
  };
}

function successSummary(
  overrides: Partial<AgentRunFinalSummary> = {},
): AgentRunFinalSummary {
  return {
    filesChanged: ["src/App.tsx"],
    commandsRun: [],
    typescript: "passed",
    build: "passed",
    preview: "passed",
    uiAudit: "skipped",
    durationMs: 1000,
    durationLabel: "1s",
    errors: [],
    noChangeExplanation: null,
    outcome: "success",
    providerOutput: [],
    ...overrides,
  };
}

describe("buildAgentConversationProjection", () => {
  it("starts with live boot intent before tools arrive", () => {
    const projection = buildAgentConversationProjection({
      tools: [],
      summary: null,
      isRunning: true,
    });

    assert.match(projection.segments[0]?.text ?? "", /looking through the project/i);
  });

  it("turns tool events into human prose with passive actions", () => {
    const tools: AgentToolEvent[] = [
      tool({
        id: "read:project",
        kind: "read",
        label: "Reading project structure",
        status: "success",
      }),
      tool({
        id: "edit:summary",
        kind: "edit",
        label: "Edited App.tsx",
        status: "success",
        files: ["src/App.tsx"],
      }),
      tool({
        id: "run:build",
        kind: "run",
        label: "Build passed",
        status: "success",
      }),
    ];

    const projection = buildAgentConversationProjection({
      tools,
      summary: null,
      isRunning: true,
    });

    const narrative = narrativeTargetText(projection.segments, null);
    assert.match(narrative, /done updating App\.tsx/i);
    assert.equal(projection.actions.length, 3);
    assert.ok(projection.actions.some((action) => action.label === "Build completed"));
  });

  it("appends running and done thoughts without replacing earlier text", () => {
    const tools: AgentToolEvent[] = [
      tool({
        id: "edit:summary",
        kind: "edit",
        label: "Editing App.tsx",
        status: "running",
        files: ["src/App.tsx"],
      }),
    ];

    const running = buildAgentConversationProjection({
      tools,
      summary: null,
      isRunning: true,
    });
    const done = buildAgentConversationProjection(
      {
        tools: [{ ...tools[0]!, status: "success" }],
        summary: null,
        isRunning: true,
      },
    );

    assert.ok(running.segments.some((s) => s.id.endsWith(":running")));
    assert.ok(done.segments.some((s) => s.id.endsWith(":running")));
    assert.ok(done.segments.some((s) => s.id.endsWith(":done")));
  });

  it("uses tiered provider wait observations", () => {
    const projection = buildAgentConversationProjection({
      tools: [
        tool({
          id: "wait:provider",
          kind: "wait",
          label: "waiting",
          status: "running",
        }),
      ],
      summary: null,
      isRunning: true,
      waitElapsedMs: 25_000,
    });

    assert.equal(projection.waitSuffix, pickWaitObservation(25_000));
  });

  it("finishes with a single natural closing line", () => {
    const projection = buildAgentConversationProjection({
      tools: [
        tool({
          id: "run:build",
          kind: "run",
          label: "Build passed",
          status: "success",
        }),
      ],
      summary: successSummary(),
      previewReady: true,
      isRunning: false,
    });

    const closing = projection.segments.find((segment) => segment.id === "closing:0");
    assert.match(closing?.text ?? "", /preview is ready/i);
    assert.match(closing?.text ?? "", /builds cleanly/i);
  });

  it("keeps failure conversational without repeating the headline", () => {
    const tools: AgentToolEvent[] = [
      tool({
        id: "failure:terminal",
        kind: "failure",
        label: "Provider returned invalid patches",
        status: "failed",
      }),
    ];

    const projection = buildAgentConversationProjection({
      tools,
      summary: successSummary({
        outcome: "failed",
        filesChanged: [],
        errors: ["Provider returned invalid patches"],
      }),
      isRunning: false,
    });

    const narrative = narrativeTargetText(projection.segments, null);
    assert.match(narrative, /couldn't safely apply/i);
    assert.match(narrative, /weren't modified/i);
    assert.equal(narrative.match(/invalid patches/gi)?.length, 1);
  });
});

describe("pickWaitObservation", () => {
  it("escalates observations over time", () => {
    assert.notEqual(pickWaitObservation(5_000), pickWaitObservation(25_000));
    assert.notEqual(pickWaitObservation(25_000), pickWaitObservation(95_000));
  });
});
