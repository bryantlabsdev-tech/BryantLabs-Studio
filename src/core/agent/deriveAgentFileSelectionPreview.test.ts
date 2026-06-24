import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveAgentFileSelectionPreview,
  fileSelectionPreviewText,
} from "@/core/agent/deriveAgentFileSelectionPreview";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";

function minimalCard(overrides: Partial<AgentRunCardViewModel> = {}): AgentRunCardViewModel {
  return {
    isVisible: true,
    title: "Test",
    overallStatus: "running",
    currentStep: null,
    steps: [],
    progressPercent: 0,
    streamRevision: "1",
    providerLine: null,
    providerIdentityLine: null,
    provider: null,
    model: null,
    aiCallsUsed: 0,
    durationMs: 0,
    durationLabel: "0s",
    providerEvents: [],
    latestProviderEvent: null,
    fileActivity: [],
    filesPlanned: [],
    filesModified: [],
    filesWritten: [],
    verification: {
      typescript: "pending",
      build: "pending",
      uiAudit: "pending",
      preview: "pending",
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
    confidence: { percent: 80, level: "high", factors: [], showBeforeApply: false },
    patchImpact: { files: [], complexity: "Low", risk: "Low", estimatedTime: "1m", isVisible: false },
    failureDiagnosis: null,
    failureDetails: null,
    diagnostics: { items: [], isVisible: false },
    successSummary: null,
    thoughtStream: [],
    ...overrides,
  };
}

describe("deriveAgentFileSelectionPreview", () => {
  it("maps plan apply files with reasons and actions", () => {
    const items = deriveAgentFileSelectionPreview({
      card: minimalCard(),
      planApplySession: {
        applyRunId: "run-1",
        prompt: "test",
        planSummary: "test",
        planSource: "ai",
        applyTargetCount: 2,
        applySkippedCount: 0,
        files: [
          {
            relPath: "src/App.tsx",
            absPath: "/p/src/App.tsx",
            action: "modify",
            selectionReason: "Entry component",
            planReason: "Update layout",
            status: "proposing",
            decision: "pending",
            diffStats: { added: 10, removed: 2, changed: true },
            relevanceScore: 92,
          },
          {
            relPath: "src/New.tsx",
            absPath: "/p/src/New.tsx",
            action: "create",
            selectionReason: "New screen",
            planReason: "Feature add",
            status: "pending",
            decision: "pending",
          },
        ],
        phase: "proposing",
        selectedRelPath: "src/App.tsx",
        applyError: null,
        verification: null,
        totals: null,
      },
    });

    assert.equal(items.length, 2);
    assert.equal(items[0]?.path, "src/App.tsx");
    assert.equal(items[0]?.action, "edit");
    assert.equal(items[0]?.risk, "low");
    assert.equal(items[1]?.action, "create");
    assert.match(items[0]?.reason ?? "", /Entry component/);
  });

  it("formats copy text for file list export", () => {
    const text = fileSelectionPreviewText([
      {
        path: "src/a.ts",
        reason: "Because",
        action: "edit",
        risk: "low",
        confidence: 90,
      },
    ]);
    assert.match(text, /src\/a\.ts/);
    assert.match(text, /Because/);
  });
});
