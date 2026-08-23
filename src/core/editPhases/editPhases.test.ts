import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEditPhasePlan,
  cancelBetweenPhases,
  evaluatePhasePatchCompleteness,
  firstIncompletePhase,
  markPhaseStatus,
  pausePlanForCredits,
  prepareResumeFromCheckpoint,
  remainingPhases,
  resumeEditPhasePlan,
  runMultiPhaseEdit,
  serializeEditPhaseCheckpoint,
  applyPhaseTransactionally,
  simpleContentHash,
  detectTruncatedProviderResponse,
  type EditPhasePlan,
  type MultiPhaseEditHost,
  type StagedPhaseFile,
} from "@/core/editPhases";
import type { BryantLabsApi, VerificationResult } from "@/types";

const EIGHT_FILES = [
  "src/types.ts",
  "src/models/task.ts",
  "src/hooks/useTasks.ts",
  "src/store/kanbanStore.ts",
  "src/components/KanbanBoard.tsx",
  "src/components/MilestonePanel.tsx",
  "src/App.tsx",
  "src/index.css",
];

function okVerification(): VerificationResult {
  const cmd = {
    command: "test",
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 1,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
  return { typecheck: cmd, build: cmd, ranAt: Date.now() };
}

function failVerification(message: string): VerificationResult {
  const base = okVerification();
  return {
    ...base,
    typecheck: { ...base.typecheck, ok: false, stderr: message },
  };
}

describe("buildEditPhasePlan", () => {
  it("splits an eight-file edit into multiple phases", () => {
    const plan = buildEditPhasePlan({
      prompt: "Expand with Kanban",
      targetPaths: EIGHT_FILES,
      maxFilesPerPhase: 3,
    });
    assert.ok(plan.phases.length >= 3);
    assert.ok(plan.phases.every((p) => p.files.length <= 3));
    const all = plan.phases.flatMap((p) => p.files.map((f) => f.relPath));
    assert.deepEqual([...new Set(all)].sort(), [...EIGHT_FILES].sort());
    assert.ok(plan.phases.some((p) => p.dependsOn.length > 0));
  });

  it("splits further when estimated output exceeds budget", () => {
    const plan = buildEditPhasePlan({
      prompt: "Huge rewrite",
      targetPaths: ["src/a.ts", "src/b.ts"],
      fileSizes: { "src/a.ts": 80_000, "src/b.ts": 80_000 },
      maxFilesPerPhase: 3,
    });
    assert.ok(plan.phases.length >= 2);
  });
});

describe("patch completeness", () => {
  it("fails on incomplete required file blocks", () => {
    const result = evaluatePhasePatchCompleteness({
      assigned: [
        { relPath: "src/a.ts", role: "required", reason: "core" },
        { relPath: "src/b.ts", role: "required", reason: "core" },
      ],
      patches: [{ relPath: "src/a.ts", newContent: "export const a = 1;" }],
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingRequired, ["src/b.ts"]);
  });

  it("allows optional targets with no patch", () => {
    const result = evaluatePhasePatchCompleteness({
      assigned: [
        { relPath: "src/a.ts", role: "required", reason: "core" },
        { relPath: "src/optional.ts", role: "optional", reason: "explore" },
      ],
      patches: [{ relPath: "src/a.ts", newContent: "export const a = 1;" }],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.optionalUnchanged, ["src/optional.ts"]);
  });

  it("classifies newly discovered dependencies without failing", () => {
    const result = evaluatePhasePatchCompleteness({
      assigned: [{ relPath: "src/a.ts", role: "required", reason: "core" }],
      patches: [
        { relPath: "src/a.ts", newContent: "export const a = 1;" },
        { relPath: "src/newDep.ts", newContent: "export const d = 1;" },
      ],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.discoveredDependencies, ["src/newDep.ts"]);
  });

  it("detects truncated provider responses", () => {
    assert.equal(detectTruncatedProviderResponse("@@FILE src/a.ts\npartial"), true);
    assert.equal(
      detectTruncatedProviderResponse("finish_reason: length"),
      true,
    );
    const result = evaluatePhasePatchCompleteness({
      assigned: [{ relPath: "src/a.ts", role: "required", reason: "core" }],
      patches: [],
      rawProviderText: "@@FILE src/a.ts\nincomplete without end",
    });
    assert.equal(result.truncatedResponse, true);
    assert.equal(result.ok, false);
  });
});

describe("transactional apply", () => {
  it("rolls back atomically after partial write failure", async () => {
    const disk = new Map<string, string>([
      ["src/a.ts", "before-a"],
      ["src/b.ts", "before-b"],
    ]);
    let writes = 0;
    const api = {
      applyEdit: async (abs: string, _before: string, after: string) => {
        writes += 1;
        if (writes === 2) return { ok: false, reason: "disk full" };
        disk.set(abs, after);
        return { ok: true };
      },
      createProjectFile: async () => ({ ok: true }),
      deleteProjectFile: async (abs: string) => {
        disk.delete(abs);
        return { ok: true };
      },
      readFile: async (abs: string) => ({
        readable: true,
        content: disk.get(abs) ?? "",
      }),
    } as unknown as BryantLabsApi;

    const staged: StagedPhaseFile[] = [
      {
        relPath: "src/a.ts",
        absPath: "src/a.ts",
        beforeContent: "before-a",
        afterContent: "after-a",
        action: "modify",
      },
      {
        relPath: "src/b.ts",
        absPath: "src/b.ts",
        beforeContent: "before-b",
        afterContent: "after-b",
        action: "modify",
      },
    ];

    const result = await applyPhaseTransactionally(api, staged);
    assert.equal(result.ok, false);
    assert.equal(result.claimedSuccess, false);
    assert.equal(result.rolledBack, true);
    assert.equal(result.rollbackOk, true);
    assert.equal(disk.get("src/a.ts"), "before-a");
    assert.equal(disk.get("src/b.ts"), "before-b");
    assert.equal(simpleContentHash("before-a"), result.beforeHashes["src/a.ts"]);
  });
});

describe("multi-phase runner", () => {
  function makePlan(): EditPhasePlan {
    return buildEditPhasePlan({
      prompt: "Add Kanban",
      targetPaths: EIGHT_FILES,
      maxFilesPerPhase: 3,
      planId: "test-plan",
    });
  }

  function mockHost(overrides: Partial<MultiPhaseEditHost> = {}): MultiPhaseEditHost {
    const disk = new Map<string, string>();
    for (const path of EIGHT_FILES) disk.set(path, `// ${path} original`);

    const api = {
      applyEdit: async (abs: string, _b: string, after: string) => {
        disk.set(abs, after);
        return { ok: true };
      },
      createProjectFile: async (abs: string, content: string) => {
        disk.set(abs, content);
        return { ok: true };
      },
      deleteProjectFile: async (abs: string) => {
        disk.delete(abs);
        return { ok: true };
      },
      readFile: async (abs: string) => ({
        readable: true,
        content: disk.get(abs) ?? "",
      }),
    } as unknown as BryantLabsApi;

    return {
      api,
      projectPath: "/tmp/northstar-test",
      proposePhasePatches: async (phase) => ({
        patches: phase.files
          .filter((f) => f.role === "required")
          .map((f) => ({
            relPath: f.relPath,
            newContent: `// updated ${f.relPath}`,
          })),
        rawText: phase.files.map((f) => `@@FILE ${f.relPath}\n// updated\n@@END`).join("\n"),
      }),
      verifyFast: async () => okVerification(),
      verifyFull: async () => okVerification(),
      buildStagedFiles: async (_phase, patches) =>
        patches
          .filter((p) => p.newContent)
          .map((p) => ({
            relPath: p.relPath,
            absPath: p.relPath,
            beforeContent: disk.get(p.relPath) ?? "",
            afterContent: p.newContent!,
            action: disk.has(p.relPath) ? ("modify" as const) : ("create" as const),
          })),
      ...overrides,
    };
  }

  it("completes all phases for an eight-file plan", async () => {
    const result = await runMultiPhaseEdit(mockHost(), makePlan());
    assert.equal(result.ok, true);
    assert.equal(result.plan.status, "completed");
    assert.equal(remainingPhases(result.plan).length, 0);
    assert.ok(result.providerCalls >= result.plan.phases.length);
  });

  it("performs one bounded repair on verification failure then succeeds", async () => {
    let verifies = 0;
    let repaired = false;
    const host = mockHost({
      verifyFast: async () => {
        verifies += 1;
        if (!repaired && verifies === 1) return failVerification("TS2304");
        return okVerification();
      },
      verifyFull: async () => {
        verifies += 1;
        if (!repaired) return failVerification("TS2304");
        return okVerification();
      },
      repairPhase: async (phase) => {
        repaired = true;
        return {
          patches: phase.files.map((f) => ({
            relPath: f.relPath,
            newContent: `// repaired ${f.relPath}`,
          })),
          rawText: "repaired",
        };
      },
    });
    const result = await runMultiPhaseEdit(host, makePlan());
    assert.equal(result.ok, true);
    assert.ok(result.repairAttempts >= 1);
    assert.ok(result.repairAttempts <= result.plan.phases.length);
  });

  it("pauses cleanly on insufficient credits during a later phase", async () => {
    let calls = 0;
    const host = mockHost({
      proposePhasePatches: async (phase) => {
        calls += 1;
        if (calls >= 2) {
          return {
            patches: [],
            rawText: null,
            creditError: "Insufficient Anthropic credits",
          };
        }
        return {
          patches: phase.files.map((f) => ({
            relPath: f.relPath,
            newContent: `// updated ${f.relPath}`,
          })),
          rawText: "ok",
        };
      },
    });
    const result = await runMultiPhaseEdit(host, makePlan());
    assert.equal(result.ok, false);
    assert.equal(result.plan.status, "paused");
    assert.match(result.error ?? "", /credits/i);
    const completed = result.plan.phases.filter(
      (p) => result.plan.phaseStates[p.id]?.status === "completed",
    );
    assert.ok(completed.length >= 1);
  });

  it("resumes without repeating completed phases", () => {
    let plan = makePlan();
    const first = plan.phases[0]!;
    plan = markPhaseStatus(plan, first.id, {
      status: "completed",
      completedAt: Date.now(),
      filesChanged: first.files.map((f) => f.relPath),
      beforeHashes: { [first.files[0]!.relPath]: "aaa" },
      afterHashes: { [first.files[0]!.relPath]: "bbb" },
    });
    const checkpoint = serializeEditPhaseCheckpoint("/tmp/p", plan);
    const resumed = prepareResumeFromCheckpoint(checkpoint);
    assert.equal(resumed.resumePhaseId, plan.phases[1]!.id);
    assert.equal(resumed.plan.phaseStates[first.id]?.status, "completed");
    assert.equal(firstIncompletePhase(resumeEditPhasePlan(plan))?.id, plan.phases[1]!.id);
  });

  it("cancels between phases leaving completed work intact", () => {
    let plan = makePlan();
    const first = plan.phases[0]!;
    plan = markPhaseStatus(plan, first.id, { status: "completed", completedAt: Date.now() });
    plan = cancelBetweenPhases(plan);
    assert.equal(plan.status, "cancelled");
    assert.equal(plan.phaseStates[first.id]?.status, "completed");
    const cancelled = plan.phases.filter(
      (p) => plan.phaseStates[p.id]?.status === "cancelled",
    );
    assert.ok(cancelled.length > 0);
  });

  it("never claims success after a failed phase", async () => {
    const host = mockHost({
      proposePhasePatches: async () => ({
        patches: [],
        rawText: "@@FILE src/types.ts\ntruncated",
        truncated: true,
      }),
    });
    const result = await runMultiPhaseEdit(host, makePlan());
    assert.equal(result.ok, false);
    assert.equal(result.plan.status, "failed");
    assert.notEqual(result.plan.status, "completed");
  });

  it("pausePlanForCredits records reason", () => {
    const plan = pausePlanForCredits(makePlan(), "rate limited");
    assert.equal(plan.status, "paused");
    assert.equal(plan.pausedReason, "rate limited");
  });
});
