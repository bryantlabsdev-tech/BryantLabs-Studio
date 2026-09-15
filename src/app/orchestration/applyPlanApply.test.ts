import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { applyApprovedPlanFilesOrchestration } from "@/app/orchestration/applyPlanApply";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import { clearPatchGeneratedWatchdog } from "@/core/agent/patchApplyWatchdog";
import { setForcedVerificationResult } from "@/core/agent/runRecoveryTestSeams";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import type { PlanApplyFileEntry, PlanApplySession } from "@/core/planApply";
import type { VerificationResult } from "@/types";

afterEach(() => {
  clearPatchGeneratedWatchdog();
  setForcedVerificationResult(null);
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
  readonly undoBatches: readonly { path: string; previousContent: string; created: boolean }[][];
  readonly canUndo: { value: boolean };
  readonly state: {
    planApplyError: string | null;
    session: PlanApplySession | null;
    verification: VerificationResult | null;
    checkpoint: { applyRunId?: string } | null;
    failureLine: string | null;
  };
} {
  const written: string[] = [];
  const undoBatches: { path: string; previousContent: string; created: boolean }[][] = [];
  const canUndo = { value: false };
  let persisted: PlanApplySession | null = session;
  let memory = emptySessionMemory("/tmp/project");
  const state = {
    planApplyError: null as string | null,
    session,
    verification: null as VerificationResult | null,
    checkpoint: null as { applyRunId?: string } | null,
    failureLine: null as string | null,
  };
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
      deleteProjectFile: async (absPath: string) => {
        written.push(`delete:${absPath}`);
        return { ok: true, content: "", path: absPath };
      },
      replaceUndoBatch: async (
        entries: { path: string; previousContent: string; created: boolean }[],
      ) => {
        undoBatches.push(entries.map((e) => ({ ...e })));
        return { ok: true };
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
    setPlanApplyError: (value: string | null) => {
      state.planApplyError = value;
    },
    setPlanApplySession: (
      next: PlanApplySession | null | ((prev: PlanApplySession | null) => PlanApplySession | null),
    ) => {
      persisted = typeof next === "function" ? next(persisted) : next;
      state.session = persisted;
    },
    setCenterTab: () => {},
    beginStudioAction: () => {},
    finishStudioAction: () => {},
    updateGreenfieldRun: () => {},
    publishFailureReport: (report: { rootCauseLine?: string } | null) => {
      state.failureLine = report?.rootCauseLine ?? null;
    },
    appendGreenfieldRunLog: () => {},
    setSessionMemory: (
      next: typeof memory | ((prev: typeof memory) => typeof memory),
    ) => {
      memory = typeof next === "function" ? next(memory) : next;
    },
    setVerification: (value: VerificationResult | null) => {
      state.verification = value;
    },
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
    setCanUndo: (value: boolean) => {
      canUndo.value = value;
    },
    setLastEditedPath: () => {},
    saveFollowUpCheckpoint: (checkpoint: { applyRunId?: string }) => {
      state.checkpoint = checkpoint.applyRunId
        ? { applyRunId: checkpoint.applyRunId }
        : {};
    },
  };
  return {
    host: host as unknown as ApplyPlanOrchestrationHost,
    written,
    undoBatches,
    canUndo,
    state,
  };
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

  it("waiting_for_review does not write until approveReadyFiles", async () => {
    const harness = applyHost(pendingSession([readyFile("src/App.tsx")]));
    const result = await applyApprovedPlanFilesOrchestration(harness.host);
    assert.equal(result.ok, false);
    assert.equal(result.error, "No approved files");
    assert.equal(harness.written.length, 0);
  });

  it("rejecting review (no session) writes nothing", async () => {
    const harness = applyHost(null);
    const result = await applyApprovedPlanFilesOrchestration(harness.host, {
      approveReadyFiles: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "No apply session");
    assert.equal(harness.written.length, 0);
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

describe("applyApprovedPlanFilesOrchestration undo batch", () => {
  it("successful Apply Plan records the complete batch", async () => {
    const harness = applyHost(
      pendingSession([
        readyFile("src/App.tsx"),
        readyFile("src/components/History.tsx", {
          action: "create",
          basisContent: "",
          proposal: {
            summary: "history",
            newContent: "export function History() { return null; }\n",
            reasoning: "",
            risks: [],
          },
        }),
      ]),
    );
    const result = await applyApprovedPlanFilesOrchestration(harness.host, {
      pipelineMode: true,
      approveReadyFiles: true,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.applied, ["src/App.tsx", "src/components/History.tsx"]);
    const lastBatch = harness.undoBatches[harness.undoBatches.length - 1];
    assert.deepEqual(lastBatch, [
      {
        path: "/tmp/project/src/App.tsx",
        previousContent: "export const value = 1;\n",
        created: false,
      },
      {
        path: "/tmp/project/src/components/History.tsx",
        previousContent: "",
        created: true,
      },
    ]);
    assert.equal(harness.canUndo.value, true);
  });

  it("failed Apply Plan rollback clears pending undo state", async () => {
    const disk = new Map<string, string>([
      ["/tmp/project/src/App.tsx", "export const value = 1;\n"],
      ["/tmp/project/src/broken.ts", "export const value = 1;\n"],
    ]);
    const harness = applyHost(
      pendingSession([
        readyFile("src/App.tsx"),
        readyFile("src/broken.ts", {
          proposal: {
            summary: "broken",
            newContent: "export const value = 2;\n",
            reasoning: "",
            risks: [],
          },
        }),
      ]),
    );
    const api = harness.host.api!;
    api.readFile = async (absPath: string) => {
      if (!disk.has(absPath)) {
        return { readable: false, content: "", language: null, reason: "missing" };
      }
      return { readable: true, content: disk.get(absPath)!, language: "typescript" };
    };
    harness.host.api!.applyEdit = async (absPath: string, _before: string, after: string) => {
      if (absPath.endsWith("broken.ts")) {
        return { ok: false, reason: "disk full" };
      }
      disk.set(absPath, after);
      return { ok: true, content: after, path: absPath };
    };
    harness.host.api!.deleteProjectFile = async (absPath: string) => {
      disk.delete(absPath);
      return { ok: true, content: "", path: absPath };
    };
    const result = await applyApprovedPlanFilesOrchestration(harness.host, {
      pipelineMode: true,
      approveReadyFiles: true,
    });
    assert.equal(result.ok, false);
    assert.equal(disk.get("/tmp/project/src/App.tsx"), "export const value = 1;\n");
    const lastBatch = harness.undoBatches[harness.undoBatches.length - 1];
    assert.deepEqual(lastBatch, []);
    assert.equal(harness.canUndo.value, false);
  });
});

describe("applyApprovedPlanFilesOrchestration verification failure", () => {
  it("writes files, keeps undo, and clears the review session", async () => {
    const harness = applyHost(pendingSession([readyFile("src/App.tsx")]));
    setForcedVerificationResult({ error: "Forced verification failure" });
    const result = await applyApprovedPlanFilesOrchestration(harness.host, {
      approveReadyFiles: true,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.applied, ["src/App.tsx"]);
    assert.match(result.error ?? "", /Forced verification failure/);
    assert.equal(harness.written.length, 1);
    assert.equal(harness.state.session, null);
    assert.match(harness.state.planApplyError ?? "", /Forced verification failure/);
    assert.equal(harness.canUndo.value, true);
    assert.equal(harness.state.checkpoint?.applyRunId, "run-accept-all");
    assert.equal(harness.undoBatches.at(-1)?.length, 1);
  });
});
