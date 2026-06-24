import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun, type GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import {
  buildStudioRunSummary,
  formatStudioSummaryRunLog,
  resolveStudioRunDurationMs,
} from "@/core/studioRun/summary";
import type { CommandResult } from "@/types";

function cmd(partial: Partial<CommandResult> & { ok: boolean }): CommandResult {
  return {
    command: partial.command ?? "test",
    ok: partial.ok,
    exitCode: partial.exitCode ?? (partial.ok ? 0 : 1),
    stdout: partial.stdout ?? "",
    stderr: partial.stderr ?? "",
    durationMs: partial.durationMs ?? 10,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
}

function buildGreenfieldPipelineEntries(): ReturnType<typeof createRunLogEntry>[] {
  const entries = [
    createRunLogEntry("generation", "success", "Generation started"),
    createRunLogEntry(
      "ai_call",
      "success",
      "greenfield · gemini · gemini-2.5-pro",
      "stage=greenfield · provider=gemini · model=gemini-2.5-pro · tokens≈355 · 57648ms · success",
    ),
    createRunLogEntry("write", "success", "Write succeeded (7 files)"),
    createRunLogEntry(
      "npm_install",
      "success",
      "npm install finished",
      "npm install · exit 0 · ok · 8053ms",
    ),
    createRunLogEntry(
      "typescript",
      "success",
      "TypeScript passed after UI repair",
      "npx tsc --noEmit · exit 0 · ok · 1282ms",
    ),
    createRunLogEntry(
      "build",
      "success",
      "Build passed after UI repair",
      "npm run build · exit 0 · ok · 1573ms",
    ),
    createRunLogEntry("preview", "success", "Preview restarted"),
  ];
  entries[0] = { ...entries[0]!, timestamp: "2026-06-20T22:56:21.668Z" };
  for (let i = 1; i < entries.length; i += 1) {
    entries[i] = {
      ...entries[i]!,
      timestamp: "2026-06-20T22:57:36.676Z",
    };
  }
  return entries;
}

function buildGreenfieldSnapshot(
  overrides: Partial<GreenfieldRunSnapshot> = {},
): GreenfieldRunSnapshot {
  const runStartedAt = Date.parse("2026-06-20T22:56:21.509Z");
  return {
    ...emptyGreenfieldRun(),
    actionType: "greenfield",
    runStartedAt,
    endedAt: Date.parse("2026-06-20T22:57:36.676Z"),
    durationMs: 107,
    runResult: "success",
    setupResult: null,
    setupStatus: "done",
    genStatus: "done",
    writeStatus: "done",
    workflow: { prompt: "Create FieldFlow" },
    filesWritten: [...GREENFIELD_FILE_PATHS],
    generatedFiles: GREENFIELD_FILE_PATHS.map((path) => ({
      path,
      content: `// ${path}`,
    })),
    entries: buildGreenfieldPipelineEntries(),
    ...overrides,
  };
}

describe("buildStudioRunSummary", () => {
  it("derives greenfield verification and duration from live log when setupResult is missing", () => {
    const snapshot = buildGreenfieldSnapshot();
    const summary = buildStudioRunSummary(snapshot);

    assert.equal(summary.actionType, "greenfield");
    assert.equal(summary.actionLabel, "New App");
    assert.equal(summary.typescriptResult, "passed");
    assert.equal(summary.buildResult, "passed");
    assert.equal(summary.commandsRun.length, 3);

    const totalDurationMs = summary.totalDurationMs ?? 0;
    assert.ok(totalDurationMs >= 70_000);

    const text = formatStudioSummaryRunLog(summary);
    assert.match(text, /Action: New App \(greenfield\)/);
    assert.match(text, /TypeScript:\npassed/);
    assert.match(text, /Build:\npassed/);
    assert.doesNotMatch(text, /TypeScript:\n\(not run\)/);
    assert.equal(resolveStudioRunDurationMs(snapshot), totalDurationMs);
  });

  it("keeps apply_plan action type while still deriving verification from log entries", () => {
    const snapshot = buildGreenfieldSnapshot({
      actionType: "apply_plan",
      workflow: {
        prompt: "Create FieldFlow",
        filesProposed: 7,
        filesAccepted: 7,
        linesAdded: 781,
        linesRemoved: 7,
      },
      generatedFiles: null,
    });

    const summary = buildStudioRunSummary(snapshot);

    assert.equal(summary.actionType, "apply_plan");
    assert.equal(summary.actionLabel, "Apply Plan");
    assert.equal(summary.filesProposed, 7);
    assert.equal(summary.filesAccepted, 7);
    assert.equal(summary.typescriptResult, "passed");
    assert.equal(summary.buildResult, "passed");

    const totalDurationMs = summary.totalDurationMs ?? 0;
    assert.ok(totalDurationMs >= 70_000);
  });

  it("uses workflow verification for studio_agent edit follow-up runs", () => {
    const startedAt = Date.parse("2026-06-20T22:56:21.509Z");
    const endedAt = Date.parse("2026-06-20T22:57:36.676Z");
    const followUpEntry = {
      ...createRunLogEntry("pipeline", "success", "Follow-up completed"),
      timestamp: new Date(endedAt).toISOString(),
    };

    const snapshot = buildGreenfieldSnapshot({
      actionType: "studio_agent",
      runStartedAt: startedAt,
      endedAt,
      durationMs: 75_000,
      runTimeline: {
        runId: "run-1",
        route: "edit_follow_up",
        status: "complete",
        startedAt,
        completedAt: endedAt,
        lastStage: "run_complete",
        lastSuccessfulStage: "run_complete",
        totalDurationMs: 75_000,
        stages: [],
        failureDetail: null,
      },
      verification: {
        typecheck: cmd({ command: "npx tsc --noEmit", ok: true, durationMs: 900 }),
        build: cmd({ command: "npm run build", ok: true, durationMs: 1200 }),
        ranAt: endedAt,
      },
      entries: [followUpEntry],
      generatedFiles: null,
      filesWritten: ["src/App.tsx"],
      workflow: { prompt: "Add a settings page" },
    });

    const summary = buildStudioRunSummary(snapshot);

    assert.equal(summary.actionType, "studio_agent");
    assert.equal(summary.typescriptResult, "passed");
    assert.equal(summary.buildResult, "passed");
    assert.equal(summary.totalDurationMs ?? 0, resolveStudioRunDurationMs(snapshot));
  });
});
