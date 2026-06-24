import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentTrace } from "@/core/agent/agentTrace";
import { buildAgentRunArtifact } from "@/core/agent/buildAgentRunArtifact";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import {
  applyRequirementOutcome,
  buildIncompleteRepairSuggestion,
  evaluateRequirementChecklist,
} from "@/core/agent/requirementVerification";
import { formatRouteDecisionDetail } from "@/core/agent/agentTrace";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";

const CALC_HISTORY_PROMPT =
  "Add calculation history. Show last 10 calculations. Create a separate History component. Persist history in localStorage. Add clear history button.";

function completeHistoryDiffs() {
  return [
    {
      path: "src/components/History.tsx",
      linesAdded: 40,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `
export function History({ items, onClear }: { items: string[]; onClear: () => void }) {
  const visible = items.slice(-10);
  return (
    <section>
      <h2>History</h2>
      <ul>{visible.map((item) => <li key={item}>{item}</li>)}</ul>
      <button type="button" onClick={onClear}>Clear History</button>
    </section>
  );
}
`,
    },
    {
      path: "src/App.tsx",
      linesAdded: 12,
      linesRemoved: 2,
      preview: [],
      before: "export function Calculator() { return <div>Calc</div>; }",
      after: `
import { History } from "./components/History";
export function Calculator() {
  const save = (value: string) => localStorage.setItem("history", value);
  return <div><CalculatorCore /><History items={[]} onClear={() => localStorage.removeItem("history")} /></div>;
}
`,
    },
  ];
}

describe("agentTrace", () => {
  it("marks a successful build incomplete when requirements are missing", () => {
    const verification = evaluateRequirementChecklist({
      prompt: CALC_HISTORY_PROMPT,
      fileDiffs: [
        {
          path: "src/App.tsx",
          linesAdded: 2,
          linesRemoved: 0,
          preview: [],
          before: "export function Calculator() { return <div>Calc</div>; }",
          after: "export function Calculator() { return <div>Calc</div>; }",
        },
      ],
      buildPassed: true,
    });

    assert.equal(verification.allSatisfied, false);
    assert.equal(
      applyRequirementOutcome("success", verification),
      "incomplete",
    );
    assert.equal(
      verification.items.find((item) => item.id === "history-component")?.satisfied,
      false,
    );
    const historyItem = verification.items.find((item) => item.id === "history-component");
    assert.ok(historyItem?.reason?.includes("History.tsx"));
  });

  it("keeps success when all calculation history checklist items are satisfied", () => {
    const verification = evaluateRequirementChecklist({
      prompt: CALC_HISTORY_PROMPT,
      fileDiffs: completeHistoryDiffs(),
      buildPassed: true,
    });

    assert.equal(verification.allSatisfied, true);
    assert.equal(applyRequirementOutcome("success", verification), "success");
    assert.equal(verification.items.length, 5);
    assert.equal(verification.items.every((item) => item.satisfied), true);
  });

  it("orders trace events chronologically", () => {
    const base = Date.now();
    const entries = [
      createRunLogEntry("prompt", "success", "Prompt submitted"),
      createRunLogEntry("ai_plan", "success", "Plan ready"),
      createRunLogEntry("write", "success", "Wrote files"),
      createRunLogEntry("build", "success", "Build passed"),
      createRunLogEntry("preview", "success", "Preview ready"),
    ].map((entry, index) => ({
      ...entry,
      timestamp: new Date(base + index * 1000).toISOString(),
    }));

    const trace = buildAgentTrace({
      prompt: CALC_HISTORY_PROMPT,
      route: "edit_follow_up",
      generationMode: "apply_plan",
      outcome: "incomplete",
      fileDiffs: completeHistoryDiffs().slice(0, 1),
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "apply_plan",
        runStartedAt: base,
        runResult: "success",
        entries,
        runTimeline: {
          runId: "run-trace",
          route: "edit_follow_up",
          startedAt: base,
          stages: [
            {
              stage: "route",
              at: base + 100,
              elapsedMs: 100,
              stageDurationMs: 100,
              detail: "edit_follow_up",
            },
            {
              stage: "plan_complete",
              at: base + 2000,
              elapsedMs: 2000,
              stageDurationMs: 1900,
              detail: "src/App.tsx",
            },
            {
              stage: "run_complete",
              at: base + 5000,
              elapsedMs: 5000,
              stageDurationMs: 3000,
              detail: null,
            },
          ],
          lastStage: "run_complete",
          lastSuccessfulStage: "run_complete",
          status: "complete",
          completedAt: base + 5000,
          totalDurationMs: 5000,
          failureDetail: null,
        },
      },
    });

    const timestamps = trace.events.map((event) => event.timestamp);
    const sorted = [...timestamps].sort((a, b) => a - b);
    assert.deepEqual(timestamps, sorted);
    assert.equal(trace.events[0]?.kind, "prompt_received");
    assert.equal(trace.events.at(-1)?.kind, "completion_reason");
    assert.ok(trace.events.some((event) => event.kind === "route_selected"));
    assert.ok(trace.events.some((event) => event.kind === "plan_generated"));
    assert.ok(trace.events.some((event) => event.kind === "file_edited"));
    assert.equal(trace.checklist.length, 5);
  });

  it("freezes incomplete outcome on agent run artifacts when requirements are missing", () => {
    const base = Date.now();
    const artifact = buildAgentRunArtifact({
      runId: "run-artifact",
      runNumber: 1,
      userMessageId: "msg-1",
      prompt: CALC_HISTORY_PROMPT,
      stateInput: {
        greenfieldRun: {
          ...emptyGreenfieldRun(),
          actionType: "apply_plan",
          runStartedAt: base,
          endedAt: base + 5000,
          durationMs: 5000,
          runResult: "success",
          entries: [
            createRunLogEntry("build", "success", "Build passed"),
            createRunLogEntry("preview", "success", "Preview ready"),
          ],
          filesWritten: ["src/App.tsx"],
        },
        greenfieldPanelActive: false,
        agentIntent: null,
        buildPhase: "idle",
        planApplyPhase: null,
        planApplySession: null,
        autoFixPhase: null,
        buildRunning: false,
        pipelineRunning: false,
        recentLogs: [],
        runStartedAt: base,
        provider: null,
        model: null,
        buildError: null,
        planApplyError: null,
        pipelineError: null,
        plan: null,
        aiPlan: null,
        scan: null,
      },
    });

    assert.equal(artifact.outcome, "incomplete");
    assert.equal(artifact.card.overallStatus, "incomplete");
    assert.equal(artifact.agentTrace?.checklistComplete, false);
    assert.ok(artifact.agentTrace && artifact.agentTrace.events.length > 0);
  });

  it("includes reason strings for failed checklist items", () => {
    const verification = evaluateRequirementChecklist({
      prompt: CALC_HISTORY_PROMPT,
      fileDiffs: [],
      buildPassed: true,
    });
    const storage = verification.items.find((item) => item.id === "local-storage");
    assert.equal(storage?.status, "unknown");
    assert.match(storage?.reason ?? "", /No generated or modified files/i);
  });

  it("builds repair suggestion for incomplete history runs", () => {
    const verification = evaluateRequirementChecklist({
      prompt: CALC_HISTORY_PROMPT,
      fileDiffs: [],
      buildPassed: true,
    });
    const suggestion = buildIncompleteRepairSuggestion(
      CALC_HISTORY_PROMPT,
      verification.items,
    );
    assert.ok(suggestion);
    assert.ok(suggestion.missingRequirements.length > 0);
    assert.match(suggestion.suggestedPrompt, /History component/i);
    assert.match(suggestion.suggestedPrompt, /localStorage/i);
  });

  it("shows route candidates and source-count reasoning in agent trace", () => {
    const route = routeAgentPrompt({
      prompt: CALC_HISTORY_PROMPT,
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
      filesWritten: ["package.json", "index.html", "src/App.tsx"],
      previousSuccessfulRun: true,
      fallbackSourceFileCount: 7,
    });
    const detail = formatRouteDecisionDetail(route.decision);
    assert.match(detail, /Candidates:/);
    assert.match(detail, /Source count used:/);
    assert.match(detail, /Fallback source count: 7/);
    assert.match(detail, /Greenfield rejected: yes/);

    const trace = buildAgentTrace({
      prompt: CALC_HISTORY_PROMPT,
      route: "greenfield",
      generationMode: "apply_plan",
      outcome: "incomplete",
      fileDiffs: [],
      routeDecision: route.decision,
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "apply_plan",
        filesWritten: ["package.json", "index.html", "src/App.tsx"],
        runResult: "success",
        routeDecision: route.decision,
      },
    });

    const routeEvent = trace.events.find((event) => event.kind === "route_selected");
    assert.ok(routeEvent);
    assert.match(routeEvent.detail ?? "", /Fallback source count: 7/);
    assert.equal(trace.routeDecision?.selectedRoute, "build_loop");
    assert.ok(trace.repairSuggestion);
  });

  it("shows greenfield_blocked trace when empty-folder hijack was prevented", () => {
    const route = routeAgentPrompt({
      prompt: CALC_HISTORY_PROMPT,
      projectOpen: true,
      scan: mockProjectScan([], { packageJson: false }),
      scanStatus: "done",
      filesWritten: ["package.json", "index.html", "src/App.tsx"],
      previousSuccessfulRun: true,
      fallbackSourceFileCount: 7,
    });

    const trace = buildAgentTrace({
      prompt: CALC_HISTORY_PROMPT,
      route: "edit_follow_up",
      generationMode: "apply_plan",
      outcome: "failed",
      fileDiffs: [],
      routeDecision: route.decision,
      greenfieldRun: {
        ...emptyGreenfieldRun(),
        actionType: "apply_plan",
        routeDecision: route.decision,
        entries: [
          {
            id: "route-guard",
            timestamp: new Date().toISOString(),
            stage: "pipeline",
            status: "success",
            message: "Greenfield blocked by route decision",
            details:
              "Empty-folder greenfield hijack skipped — route selected build_loop for existing project edit.",
          },
        ],
      },
    });

    const blocked = trace.events.find((event) => event.kind === "greenfield_blocked");
    assert.ok(blocked);
    assert.match(blocked?.detail ?? "", /build_loop/i);
  });
});
