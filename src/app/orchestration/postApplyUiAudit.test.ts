import {
  runFollowUpUiAuditAfterPreview,
  verificationToSetupResult,
} from "@/app/orchestration/followUpVerifyRepairOrchestration";
import {
  cancelAllPostApplyUiAudits,
  cancelPostApplyUiAuditsForProject,
  getActivePostApplyUiAuditCount,
  sanitizePostApplyUiAuditPatch,
  schedulePostApplyUiAudit,
} from "@/app/orchestration/postApplyUiAudit";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { CommandResult, VerificationResult } from "@/types";
import type { UiAuditResult } from "@/core/greenfield/uiAudit";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

function okCmd(command: string): CommandResult {
  return {
    command,
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
}

function passedVerification(): VerificationResult {
  return {
    typecheck: okCmd("tsc"),
    build: okCmd("vite build"),
    ranAt: Date.now(),
  };
}

function failedAudit(): UiAuditResult {
  return {
    ok: false,
    type: "form_layout",
    score: 40,
    issues: ["controls_not_visible"],
    skipped: false,
    details: "Controls not visible in preview",
    classification: { type: "form_layout", confidence: 0.8, signals: ["form"] },
    auditTarget: "generated_app",
    auditLabel: "Generated App UI Audit",
  };
}

afterEach(() => {
  cancelAllPostApplyUiAudits("test cleanup");
});

describe("post-apply UI audit lifecycle", () => {
  it("sanitize keeps success runResult and converts hard audit fail to advisory", () => {
    const prev: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runResult: "success",
      finalMessage: "Changes applied successfully.",
    };
    const sanitized = sanitizePostApplyUiAuditPatch(prev, {
      runResult: "failed",
      finalMessage: "I couldn’t safely apply this edit.",
      latestAction: {
        status: "failed",
        summary: "UI audit failed",
        detail: "audit",
        at: new Date().toISOString(),
      },
      uiAuditResult: failedAudit(),
    });

    assert.equal(sanitized.runResult, undefined);
    assert.equal(sanitized.finalMessage, undefined);
    assert.equal(sanitized.latestAction, undefined);
    assert.equal(sanitized.uiAuditResult?.advisory, true);
    assert.equal(sanitized.uiAuditResult?.skipped, true);
  });

  it("schedulePostApplyUiAudit records advisory when audit fails after verified apply", async () => {
    const logs: Array<{ stage: string; status: string; message: string }> = [];
    let run: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runResult: "success",
      finalMessage: "Changes applied successfully.",
    };

    const host = {
      api: {
        readFile: async () => ({
          content: "export default function App(){return null}",
          language: "tsx",
          readable: true,
        }),
        greenfieldUiAudit: async () => ({
          ok: false as const,
          error: "simulated audit transport failure",
        }),
      },
      appendGreenfieldRunLog: (
        stage: string,
        status: "running" | "success" | "failed",
        message: string,
      ) => {
        logs.push({ stage, status, message });
      },
      updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => {
        run = { ...run, ...patch };
      },
    };

    const { promise } = schedulePostApplyUiAudit(host as never, {
      folderPath: "/tmp/project",
      previewUrl: "http://127.0.0.1:5174/",
      userPrompt: "Add a filter",
      verification: passedVerification(),
    });

    const result = await promise;
    assert.equal(result.ok, true);
    assert.equal(result.advisory, true);
    assert.equal(run.runResult, "success");
    assert.equal(run.finalMessage, "Changes applied successfully.");
    assert.equal(run.uiAuditResult?.advisory, true);
    assert.ok(logs.every((l) => l.status !== "failed"));
    assert.ok(logs.some((l) => /advisory/i.test(l.message)));
  });

  it("cancelPostApplyUiAuditsForProject aborts without mutating success", async () => {
    let run: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runResult: "success",
      finalMessage: "ok",
    };
    let resolveAudit!: (v: unknown) => void;
    const auditGate = new Promise((resolve) => {
      resolveAudit = resolve;
    });

    const host = {
      api: {
        readFile: async () => {
          await auditGate;
          return {
            content: "export default function App(){return null}",
            language: "tsx",
            readable: true,
          };
        },
        greenfieldUiAudit: async () => ({
          ok: true as const,
          snapshot: {
            rootTextLength: 10,
            viewport: { width: 800, height: 600 },
            overflow: { x: false, y: false },
            grid: null,
            form: null,
            table: null,
            chat: null,
            calculator: null,
            dashboard: null,
            mobile: null,
          },
        }),
      },
      appendGreenfieldRunLog: () => undefined,
      updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => {
        run = { ...run, ...patch };
      },
    };

    const { promise } = schedulePostApplyUiAudit(host as never, {
      folderPath: "/tmp/project-a",
      previewUrl: "http://127.0.0.1:5174/",
      userPrompt: "x",
      verification: passedVerification(),
    });

    assert.equal(getActivePostApplyUiAuditCount(), 1);
    cancelPostApplyUiAuditsForProject("/tmp/project-a");
    resolveAudit(undefined);
    const result = await promise;
    assert.equal(result.cancelled, true);
    assert.equal(run.runResult, "success");
    assert.equal(run.finalMessage, "ok");
    assert.equal(getActivePostApplyUiAuditCount(), 0);
  });

  it("runFollowUpUiAuditAfterPreview stays ok/advisory when UI audit fails", async () => {
    const logs: string[] = [];
    let run: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      runResult: "success",
      finalMessage: "Applied",
    };

    const outcome = await runFollowUpUiAuditAfterPreview(
      {
        api: {
          readFile: async () => ({
            content: "export default function App(){return null}",
            language: "tsx",
            readable: true,
          }),
          greenfieldUiAudit: async () => ({
            ok: false as const,
            error: "boom",
          }),
        } as never,
        appendGreenfieldRunLog: (_s, status, message) => {
          logs.push(`${status}:${message}`);
        },
        updateGreenfieldRun: (patch) => {
          run = { ...run, ...patch };
        },
        requestPreviewTab: () => undefined,
        setAppPreview: () => undefined,
      },
      {
        folderPath: "/tmp/p",
        previewUrl: "http://127.0.0.1:5174/",
        userPrompt: "Add overdue highlight",
        verification: passedVerification(),
      },
    );

    assert.equal(outcome.ok, true);
    assert.equal(outcome.advisory, true);
    assert.equal(run.runResult, "success");
    assert.equal(run.finalMessage, "Applied");
    assert.ok(logs.every((l) => !l.startsWith("failed:")));
  });
});

describe("verificationToSetupResult", () => {
  it("maps verification into setup", () => {
    const setup = verificationToSetupResult(passedVerification());
    assert.equal(setup.ok, true);
    assert.equal(setup.typecheck?.ok, true);
    assert.equal(setup.build?.ok, true);
  });
});
