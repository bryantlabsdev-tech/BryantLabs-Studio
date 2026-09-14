import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { applyApprovedPlanFilesOrchestration } from "@/app/orchestration/applyPlanApply";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import { clearPatchGeneratedWatchdog } from "@/core/agent/patchApplyWatchdog";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import type { PlanApplyFileEntry, PlanApplySession } from "@/core/planApply";
import type { VerificationResult } from "@/types";

afterEach(() => {
  clearPatchGeneratedWatchdog();
});

function okVerification(): VerificationResult {
  const step = {
    command: "skipped",
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
  return { typecheck: step, build: step, ranAt: Date.now() };
}

function readyFile(
  relPath: string,
  patch: Partial<PlanApplyFileEntry> = {},
): PlanApplyFileEntry {
  return {
    relPath,
    absPath: `/tmp/project/${relPath}`,
    selectionReason: "plan",
    planReason: "edit",
    status: "ready",
    decision: "pending",
    action: "modify",
    basisContent: "export const value = 1;\n",
    proposal: {
      summary: "bump",
      newContent: "export const value = 2;\n",
      reasoning: "",
      risks: [],
    },
    diffStats: { added: 1, removed: 1, changed: true },
    ...patch,
  };
}

function pendingSession(files: PlanApplyFileEntry[]): PlanApplySession {
  return {
    applyRunId: "run-accept-all",
    prompt: "Bump the exported value",
    planSummary: "Bump value",
    planSource: "ai",
    applyTargetCount: files.length,
    applySkippedCount: 0,
    selectedRelPath: files[0]?.relPath ?? null,
    applyError: null,
    verification: null,
    totals: null,
    phase: "waiting_for_review",
    files,
  };
}

function applyHost(session: PlanApplySession | null): {
  readonly host: ApplyPlanOrchestrationHost;
  readonly written: string[];
} {
  const written: string[] = [];
  let persisted: PlanApplySession | null = session;
  let memory = emptySessionMemory("/tmp/project");
  const host = {
    api: {
      applyEdit: async (absPath: string) => {
        written.push(absPath);
        return { ok: true, content: "export const value = 2;\n", path: absPath };
      },
      createProjectFile: async (absPath: string) => {
        written.push(absPath);
        return { ok: true, content: "created", path: absPath };
      },
      verify: async () => okVerification(),
    },
    project: { path: "/tmp/project", name: "project" },
    scan: null,
    planApplySession: session,
    applyPlanActiveRunIdRef: { current: null as string | null },
    beginApplyPlanRun: () => "run-accept-all",
    isStaleApplyPlanRun: () => false,
    ignoreStaleApplyPlanResult: () => {},
    completeApplyPlanRun: () => {},
    setPlanApplyError: () => {},
    setPlanApplySession: (
      next: PlanApplySession | null | ((prev: PlanApplySession | null) => PlanApplySession | null),
    ) => {
      persisted = typeof next === "function" ? next(persisted) : next;
    },
    setCenterTab: () => {},
    beginStudioAction: () => {},
    finishStudioAction: () => {},
    updateGreenfieldRun: () => {},
    publishFailureReport: () => {},
    appendGreenfieldRunLog: () => {},
    setSessionMemory: (
      next: typeof memory | ((prev: typeof memory) => typeof memory),
    ) => {
      memory = typeof next === "function" ? next(memory) : next;
    },
    setVerification: () => {},
    setVerifyStatus: () => {},
    runScan: () => {},
    requestPreviewTab: () => {},
    setAppPreview: () => {},
    recordSmartFileHistory: () => {},
    startAutoFixAfterApply: async () => ({
      ok: false,
      verification: null,
      awaitingApproval: false,
    }),
    setCanUndo: () => {},
    setLastEditedPath: () => {},
  };
  return { host: host as unknown as ApplyPlanOrchestrationHost, written };
}

describe("applyApprovedPlanFilesOrchestration accept all", () => {
  it("applies pending ready files when approveReadyFiles is true", async () => {
    const harness = applyHost(pendingSession([readyFile("src/App.tsx")]));
    const result = await applyApprovedPlanFilesOrchestration(harness.host, {
      pipelineMode: true,
      approveReadyFiles: true,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.ok, true);
    assert.deepEqual(result.applied, ["src/App.tsx"]);
    assert.equal(harness.written.length, 1);
    assert.match(harness.written[0] ?? "", /src\/App\.tsx$/);
  });

  it("refuses pending files without approveReadyFiles", async () => {
    const harness = applyHost(pendingSession([readyFile("src/App.tsx")]));
    const result = await applyApprovedPlanFilesOrchestration(harness.host, {
      pipelineMode: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "No approved files");
    assert.deepEqual(result.applied, []);
    assert.equal(harness.written.length, 0);
  });

  it("approves only requested ready files via approveRelPaths", async () => {
    const harness = applyHost(
      pendingSession([readyFile("src/App.tsx"), readyFile("src/main.tsx")]),
    );
    const result = await applyApprovedPlanFilesOrchestration(harness.host, {
      pipelineMode: true,
      approveRelPaths: ["src/App.tsx"],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.applied, ["src/App.tsx"]);
    assert.equal(harness.written.length, 1);
    assert.match(harness.written[0] ?? "", /src\/App\.tsx$/);
  });
});
