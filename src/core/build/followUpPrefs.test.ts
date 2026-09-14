import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  AUTO_APPLY_FOLLOW_UP_PATCHES,
  awaitFollowUpPipelineReviewApproval,
  interpretFollowUpReviewFirst,
  readFollowUpReviewFirst,
  resolveFollowUpAutoContinue,
  shouldAutoContinueFollowUpApply,
  shouldAutoPromoteFollowUpReview,
  writeFollowUpReviewFirst,
} from "./followUpPrefs.ts";
import { buildUiAuditAdvisoryFixPrompt, recommendationsForUiAuditIssues } from "@/core/agent/uiAuditAdvisoryUx";
import type { PlanApplySession } from "@/core/planApply";

describe("followUpPrefs", () => {
  const key = "bryantlabs.followUpReviewFirst";
  const original = globalThis.localStorage;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    globalThis.localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    } as Storage;
  });

  afterEach(() => {
    globalThis.localStorage = original;
  });

  it("honors missing, 1, and 0 localStorage values", () => {
    assert.equal(AUTO_APPLY_FOLLOW_UP_PATCHES, false);
    assert.equal(readFollowUpReviewFirst(), true);
    assert.equal(interpretFollowUpReviewFirst(null), true);

    writeFollowUpReviewFirst(true);
    assert.equal(store[key], "1");
    assert.equal(readFollowUpReviewFirst(), true);
    assert.equal(interpretFollowUpReviewFirst("1"), true);

    writeFollowUpReviewFirst(false);
    assert.equal(store[key], "0");
    assert.equal(readFollowUpReviewFirst(), false);
    assert.equal(interpretFollowUpReviewFirst("0"), false);
  });

  it("forces review-first off when the emergency auto-apply switch is true", () => {
    assert.equal(interpretFollowUpReviewFirst(null, true), false);
    assert.equal(interpretFollowUpReviewFirst("1", true), false);
    assert.equal(interpretFollowUpReviewFirst("0", true), false);
  });

  it("uses autoContinue=false for ordinary follow-ups while review-first is on", () => {
    assert.equal(resolveFollowUpAutoContinue("Add a timer"), false);
    assert.equal(shouldAutoContinueFollowUpApply("Add a timer"), false);
  });

  it("auto-continues ordinary follow-ups when review-first is disabled", () => {
    writeFollowUpReviewFirst(false);
    assert.equal(resolveFollowUpAutoContinue("Add a timer"), true);
  });

  it("still auto-continues UI-audit exceptions while review-first is on", () => {
    const prompt = buildUiAuditAdvisoryFixPrompt({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
    });
    assert.equal(shouldAutoContinueFollowUpApply(prompt), true);
    assert.equal(resolveFollowUpAutoContinue(prompt), true);
  });

  it("keeps regenerate on the same auto-continue preference", () => {
    writeFollowUpReviewFirst(true);
    assert.equal(resolveFollowUpAutoContinue("Add a timer"), false);
    writeFollowUpReviewFirst(false);
    assert.equal(resolveFollowUpAutoContinue("Add a timer"), true);
    const prompt = buildUiAuditAdvisoryFixPrompt({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
    });
    writeFollowUpReviewFirst(true);
    assert.equal(resolveFollowUpAutoContinue(prompt), true);
  });

  it("does not auto-promote waiting review while the kill switch is false", () => {
    const session = {
      applyRunId: "run-1",
      prompt: "Add a timer",
      planSummary: "timer",
      planSource: "ai",
      applyTargetCount: 1,
      applySkippedCount: 0,
      selectedRelPath: "src/App.tsx",
      applyError: null,
      verification: null,
      totals: null,
      phase: "waiting_for_review",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/src/App.tsx",
          selectionReason: "plan",
          planReason: "edit",
          status: "ready",
          decision: "pending",
          diffStats: { added: 1, removed: 0, changed: true },
        },
      ],
    } as PlanApplySession;
    assert.equal(shouldAutoPromoteFollowUpReview(session), false);
    assert.equal(shouldAutoPromoteFollowUpReview(null), false);
    assert.equal(shouldAutoPromoteFollowUpReview(session, true), true);
  });

  it("pipeline approval waits on the gate while the kill switch is false", async () => {
    const hold: { resolve: ((ok: boolean) => void) | null } = { resolve: null };
    const pending = awaitFollowUpPipelineReviewApproval(
      () =>
        new Promise<boolean>((resolve) => {
          hold.resolve = resolve;
        }),
    );
    assert.ok(hold.resolve);
    hold.resolve(true);
    assert.equal(await pending, true);

    const cancelled = awaitFollowUpPipelineReviewApproval(
      () =>
        new Promise<boolean>((resolve) => {
          hold.resolve = resolve;
        }),
    );
    assert.ok(hold.resolve);
    hold.resolve(false);
    assert.equal(await cancelled, false);
  });

  it("pipeline emergency auto-resolve still works if the kill switch is on", async () => {
    let gated = false;
    const result = await awaitFollowUpPipelineReviewApproval(async () => {
      gated = true;
      return false;
    }, true);
    assert.equal(result, true);
    assert.equal(gated, false);
  });
});
