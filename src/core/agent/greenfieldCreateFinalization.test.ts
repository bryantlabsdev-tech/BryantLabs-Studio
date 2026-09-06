import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentConversationProjection } from "@/core/agent/agentConversationProjection";
import {
  decideScanAfterGreenfieldWrites,
  isUnstableEmptyDoneScan,
  resetCreateFinalizationWorkForTests,
  runCreateFinalizationWorkOnce,
  simulateRealProviderCreateFinalization,
} from "@/core/agent/greenfieldCreateFinalization";
import { buildAgentToolStream } from "@/core/agent/agentToolStream";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { mockProjectScan } from "@/core/repository/testScan";

const WRITTEN = [
  "package.json",
  "index.html",
  "src/main.tsx",
  "tsconfig.json",
  "vite.config.ts",
  "src/index.css",
  "src/App.tsx",
] as const;

function card(overrides: Partial<AgentRunCardViewModel> = {}): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Create",
    overallStatus: "complete",
    currentStep: { id: "applying", label: "Done", status: "success" },
    steps: [],
    progressPercent: 100,
    streamRevision: "1",
    providerLine: null,
    providerIdentityLine: "Claude",
    provider: "Claude",
    model: "opus",
    aiCallsUsed: 1,
    durationMs: 1000,
    durationLabel: "1s",
    providerEvents: [],
    latestProviderEvent: null,
    fileActivity: [],
    filesPlanned: [],
    filesModified: [...WRITTEN],
    filesWritten: [...WRITTEN],
    verification: {
      typescript: "passed",
      build: "passed",
      uiAudit: "passed",
      preview: "ready",
    },
    summary: null,
    stuckMessage: null,
    showRecoveryActions: false,
    reasoning: {
      isVisible: false,
      headline: "",
      detected: [],
      planSteps: [],
      plannerReasoning: [],
      risks: [],
    },
    confidence: { percent: 90, level: "high", factors: [], showBeforeApply: false },
    patchImpact: { files: [], complexity: "Low", risk: "Low", estimatedTime: "1m", isVisible: false },
    failureDiagnosis: null,
    failureDetails: null,
    diagnostics: { items: [], isVisible: false },
    successSummary: null,
    thoughtStream: [],
    ...overrides,
  };
}

describe("greenfield create finalization (real-provider sequence)", () => {
  it("rejects scanStatus done with zero sources while App.tsx was written", () => {
    const empty = mockProjectScan([], { packageJson: false });
    assert.equal(
      isUnstableEmptyDoneScan({
        scanStatus: "done",
        scan: empty,
        knownSourcePaths: WRITTEN,
      }),
      true,
    );
    const decision = decideScanAfterGreenfieldWrites({
      scan: empty,
      scanStatus: "done",
      knownSourcePaths: WRITTEN,
    });
    assert.equal(decision.acceptAsDone, false);
    assert.equal(decision.forceRescan, true);
    assert.equal(decision.indexedSourceFileCount, 0);
  });

  it("accepts a populated rescan as the stable final scan", () => {
    const populated = mockProjectScan(["src/App.tsx", "src/main.tsx", "src/index.css"]);
    const decision = decideScanAfterGreenfieldWrites({
      scan: populated,
      scanStatus: "done",
      knownSourcePaths: WRITTEN,
    });
    assert.equal(decision.acceptAsDone, true);
    assert.equal(decision.forceRescan, false);
    assert.ok(decision.indexedSourceFileCount > 0);
  });

  it("shares StrictMode-duplicate audit/repair work", async () => {
    resetCreateFinalizationWorkForTests();
    let runs = 0;
    const work = () =>
      runCreateFinalizationWorkOnce("ui_audit::/tmp/app", async () => {
        runs += 1;
        return "ok";
      });
    const [a, b] = await Promise.all([work(), work()]);
    assert.equal(a, "ok");
    assert.equal(b, "ok");
    assert.equal(runs, 1);
  });

  it("does not narrate a recovered UI audit as an apply failure", () => {
    const entries = [
      createRunLogEntry("generation", "success", "Generation finished"),
      createRunLogEntry("write", "success", "Write succeeded (7 files)"),
      createRunLogEntry("typescript", "success", "TypeScript passed"),
      createRunLogEntry("build", "success", "Build passed"),
      createRunLogEntry("preview", "success", "Preview started"),
      createRunLogEntry(
        "ui_audit",
        "failed",
        "Generated App UI Audit found issues · form_layout",
      ),
      createRunLogEntry("ui_repair", "success", "Deterministic UI repair applied"),
      createRunLogEntry("ui_audit", "success", "Generated App UI Audit passed after repair"),
    ];
    const run = {
      ...emptyGreenfieldRun(),
      actionType: "greenfield" as const,
      runResult: "success" as const,
      filesWritten: [...WRITTEN],
      entries,
    };
    const tools = buildAgentToolStream({
      entries,
      card: card(),
      run,
    });
    assert.equal(tools.some((tool) => tool.kind === "failure"), false);
    const projection = buildAgentConversationProjection({
      tools,
      summary: {
        filesChanged: [...WRITTEN],
        commandsRun: [],
        typescript: "passed",
        build: "passed",
        preview: "passed",
        uiAudit: "passed",
        durationMs: 1000,
        durationLabel: "1s",
        errors: [],
        noChangeExplanation: null,
        outcome: "success",
        providerOutput: [],
      },
      previewReady: true,
      isRunning: false,
    });
    const text = projection.segments.map((s) => s.text).join(" ");
    assert.equal(/couldn't safely apply this edit/i.test(text), false);
    assert.match(text, /7 files/i);
  });

  it("bounds the preserved create finalization sequence", () => {
    const legacy = simulateRealProviderCreateFinalization({
      unstableAnalyticsKey: true,
      acceptEmptyDoneScan: true,
      narrateUiAuditAsApplyFailure: true,
      duplicateStrictWork: true,
    });
    assert.equal(legacy.exceededMaxDepth, true);
    assert.equal(legacy.indexedSourceFileCount, 0);
    assert.equal(legacy.falseApplyFailureNarration, true);
    assert.equal(legacy.auditCount, 4);
    assert.equal(legacy.repairCount, 2);
    assert.equal(legacy.generateCount, 1);

    const fixed = simulateRealProviderCreateFinalization({
      unstableAnalyticsKey: false,
      acceptEmptyDoneScan: false,
      narrateUiAuditAsApplyFailure: false,
      duplicateStrictWork: false,
    });
    assert.equal(fixed.exceededMaxDepth, false);
    assert.ok(fixed.renderCount < 8);
    assert.ok(fixed.effectCount < 8);
    assert.equal(fixed.rescanCount, 1);
    assert.ok(fixed.indexedSourceFileCount > 0);
    assert.equal(fixed.auditCount, 2);
    assert.equal(fixed.repairCount, 1);
    assert.equal(fixed.generateCount, 1);
    assert.equal(fixed.falseApplyFailureNarration, false);
    assert.equal(fixed.runResult, "success");
    assert.equal(fixed.runActive, false);
    assert.equal(fixed.previewReady, true);
  });
});
