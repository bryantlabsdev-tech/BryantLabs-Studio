import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AUTO_APPLY_FOLLOW_UP_PATCHES, interpretFollowUpReviewFirst } from "@/core/build/followUpPrefs";
import { shouldAutoPromoteFollowUpReview } from "@/core/build/followUpPrefs";
import {
  buildGreenfieldReviewSession,
  createGreenfieldReviewProposal,
  isGreenfieldReviewFirst,
  isGreenfieldReviewSession,
  resolveApprovedGreenfieldWrite,
  resolveGreenfieldReviewAction,
  resolveOneAgentGreenfieldAfterParse,
  type GreenfieldReviewCurrent,
  type GreenfieldReviewProposal,
} from "@/core/agent/greenfieldReviewGate";
import type { PlanApplySession } from "@/core/planApply/types";

const FILES = [
  { path: "package.json", content: '{"name":"task-tracker"}\n' },
  { path: "src/App.tsx", content: "export default function App() { return null; }\n" },
] as const;

function proposal(overrides?: Partial<GreenfieldReviewProposal>): GreenfieldReviewProposal {
  return {
    ...createGreenfieldReviewProposal({
      projectPath: "/tmp/pilot",
      generationId: "gen-1",
      prompt: "Build a task tracker",
      files: FILES,
    }),
    ...overrides,
  };
}

function current(overrides?: Partial<GreenfieldReviewCurrent>): GreenfieldReviewCurrent {
  return {
    projectPath: "/tmp/pilot",
    generationId: "gen-1",
    prompt: "Build a task tracker",
    files: FILES,
    ...overrides,
  };
}

describe("One Agent greenfield review gate", () => {
  it("pauses by default before every side effect and ignores the follow-up kill switch", () => {
    assert.equal(AUTO_APPLY_FOLLOW_UP_PATCHES, false);
    assert.equal(interpretFollowUpReviewFirst(null, true), false);
    assert.equal(isGreenfieldReviewFirst(null), true);
    assert.equal(isGreenfieldReviewFirst("1"), true);
    assert.equal(isGreenfieldReviewFirst("0"), false);

    const paused = resolveOneAgentGreenfieldAfterParse({
      agentStreamlined: true,
      reviewFirstRaw: null,
      decisionReady: true,
    });
    assert.deepEqual(paused, { action: "pause", sideEffects: [] });
    assert.deepEqual(
      resolveGreenfieldReviewAction({
        proposal: proposal(),
        current: current(),
        decision: "pending",
        writesCompleted: 0,
      }),
      { write: false, setup: false, clearProposal: false, reason: "paused" },
    );
  });

  it("keeps an explicit review-first off setting and the New App wizard on their existing paths", () => {
    assert.deepEqual(
      resolveOneAgentGreenfieldAfterParse({
        agentStreamlined: true,
        reviewFirstRaw: "0",
        decisionReady: true,
      }),
      { action: "write", sideEffects: ["write", "setup"] },
    );
    assert.equal(
      resolveOneAgentGreenfieldAfterParse({
        agentStreamlined: false,
        reviewFirstRaw: null,
        decisionReady: true,
      }).action,
      "skip",
    );
    assert.equal(
      resolveOneAgentGreenfieldAfterParse({
        agentStreamlined: true,
        reviewFirstRaw: null,
        decisionReady: false,
      }).action,
      "skip",
    );
  });

  it("writes nothing on reject or cancel", () => {
    for (const decision of ["reject", "cancel"] as const) {
      assert.deepEqual(
        resolveGreenfieldReviewAction({
          proposal: proposal(),
          current: current(),
          decision,
          writesCompleted: 0,
        }),
        { write: false, setup: false, clearProposal: true, reason: "rejected" },
      );
    }
  });

  it("writes exactly once and then runs setup", () => {
    const accepted = resolveGreenfieldReviewAction({
      proposal: proposal(),
      current: current(),
      decision: "accept",
      writesCompleted: 0,
    });
    assert.deepEqual(accepted, {
      write: true,
      setup: true,
      clearProposal: true,
      reason: "accepted",
    });
    assert.equal(
      resolveGreenfieldReviewAction({
        proposal: proposal(),
        current: current(),
        decision: "accept",
        writesCompleted: 1,
      }).write,
      false,
    );
    assert.equal(
      resolveGreenfieldReviewAction({
        proposal: proposal(),
        current: current(),
        decision: "accept",
        writesCompleted: 1,
      }).reason,
      "already_written",
    );
  });

  it("invalidates the pending proposal when the project or session changes", () => {
    const cases: GreenfieldReviewCurrent[] = [
      current({ projectPath: "/tmp/other" }),
      current({ generationId: "gen-2" }),
      current({ prompt: "Build something else" }),
      current({
        files: [{ path: "src/App.tsx", content: "export const changed = true;\n" }],
      }),
    ];
    for (const next of cases) {
      const action = resolveGreenfieldReviewAction({
        proposal: proposal(),
        current: next,
        decision: "accept",
        writesCompleted: 0,
      });
      assert.equal(action.write, false);
      assert.equal(action.setup, false);
      assert.equal(action.clearProposal, true);
      assert.equal(action.reason, "invalidated");
    }
  });

  it("builds a waiting review session the existing Accept all surface can show", () => {
    const session = buildGreenfieldReviewSession(proposal());
    assert.equal(session.phase, "waiting_for_review");
    assert.equal(session.planSource, "deterministic");
    assert.equal(isGreenfieldReviewSession(session), true);
    assert.equal(session.files.every((file) => file.decision === "pending"), true);
    assert.equal(session.files.every((file) => file.diffStats?.changed), true);
    assert.equal(session.files[1]?.proposal?.newContent, FILES[1].content);
  });

  it("does not auto-promote a greenfield review when follow-up auto-apply is on", () => {
    const session = buildGreenfieldReviewSession(proposal());
    assert.equal(shouldAutoPromoteFollowUpReview(session, true), false);
    const followUp = {
      ...session,
      planSource: "ai",
      files: session.files.map((file) => ({ ...file, selectionReason: "plan" })),
    } as PlanApplySession;
    assert.equal(isGreenfieldReviewSession(followUp), false);
    assert.equal(shouldAutoPromoteFollowUpReview(followUp, true), true);
    assert.equal(shouldAutoPromoteFollowUpReview(followUp, false), false);
  });

  it("writes the frozen proposal only when live and shown files still match", () => {
    const held = proposal();
    const approved = resolveApprovedGreenfieldWrite({
      proposal: held,
      liveFiles: FILES,
      shownFiles: FILES,
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.deepEqual(approved.files, FILES);
    assert.notEqual(approved.files, held.files);

    const diverged = resolveApprovedGreenfieldWrite({
      proposal: held,
      liveFiles: [{ path: "src/App.tsx", content: "export const swapped = true;\n" }],
      shownFiles: FILES,
    });
    assert.deepEqual(diverged, { ok: false, reason: "live_files" });

    const shown = resolveApprovedGreenfieldWrite({
      proposal: held,
      liveFiles: FILES,
      shownFiles: [{ path: "src/App.tsx", content: "export const swapped = true;\n" }],
    });
    assert.deepEqual(shown, { ok: false, reason: "shown_files" });

    const mutated = proposal();
    (mutated.files[0] as { content: string }).content = "tampered";
    const broken = resolveApprovedGreenfieldWrite({
      proposal: mutated,
      liveFiles: mutated.files,
    });
    assert.deepEqual(broken, { ok: false, reason: "fingerprint" });
  });

  it("wires the pause into One Agent and keeps Accept all on the greenfield write path", () => {
    const view = readFileSync(
      new URL("../../components/views/NewAppView.tsx", import.meta.url),
      "utf8",
    );
    const orchestration = readFileSync(
      new URL("../../app/orchestration/useBuildPipelineOrchestration.ts", import.meta.url),
      "utf8",
    );
    assert.match(view, /resolveOneAgentGreenfieldAfterParse/);
    assert.match(view, /postParse\.action === "pause"/);
    assert.match(view, /acceptReview:/);
    assert.match(view, /resolveApprovedGreenfieldWrite/);
    assert.match(view, /approvedFiles: approved\.files/);
    assert.match(view, /proposalFingerprint: proposal\.fileFingerprint/);
    assert.match(orchestration, /isGreenfieldReviewSession\(host\.planApplySession\)/);
    const acceptBranch = orchestration.slice(
      orchestration.indexOf("const continueBuildAfterReview"),
      orchestration.indexOf("const autoAppliedReviewRunIdRef"),
    );
    const greenfieldCheck = acceptBranch.indexOf("isGreenfieldReviewSession");
    const planApply = acceptBranch.indexOf("applyApprovedPlanFiles");
    assert.ok(greenfieldCheck >= 0 && planApply > greenfieldCheck);
  });
});
