import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  sendAgentPrompt,
  waitForComposerReady,
  waitForGreenfieldRunTerminal,
  waitForPatchApplied,
  waitForPostPatchProgress,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";

test.describe("Create then edit (mock provider)", () => {
  let app: ElectronApplication;
  let page: Page;
  let tempEmptyProject: string;

  test.beforeAll(async () => {
    // Disposable empty folder — never wipe the shared empty-project fixture.
    tempEmptyProject = await fs.mkdtemp(path.join(os.tmpdir(), "bl-create-then-edit-"));
    await fs.writeFile(path.join(tempEmptyProject, ".gitkeep"), "\n");
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, tempEmptyProject);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    await assertNoRenderLoopConsoleErrors(page);
    await app.close();
    if (tempEmptyProject) {
      await fs.rm(tempEmptyProject, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test("greenfield create then follow-up edit reaches review", async () => {
    test.setTimeout(240_000);

    const readiness = await page.evaluate(() => window.__studioTestHooks?.getReadinessState?.());
    expect(String(readiness?.projectPath ?? "")).toContain("bl-create-then-edit-");
    await page.locator("#build-prompt").waitFor({ state: "visible", timeout: 30_000 });

    const createPrompt = "Build a simple calculator app";
    await fillAgentPrompt(page, createPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const createOutcome = await waitForGreenfieldRunTerminal(page);
    expect(createOutcome).toBe("success");

    const afterCreate = await page.evaluate(() => {
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      return {
        runResult: run?.runResult ?? null,
        setupOk: run?.setupResult?.ok ?? null,
        lastSuccessfulRunAt: run?.lastSuccessfulRunAt ?? null,
        filesWritten: run?.filesWritten?.length ?? 0,
        hasBuildSuccess: run?.entries?.some(
          (e) => e.stage === "build" && e.status === "success",
        ),
      };
    });
    expect(afterCreate.runResult).toBe("success");
    expect(afterCreate.filesWritten).toBeGreaterThan(0);
    expect(
      afterCreate.setupOk === true ||
        afterCreate.lastSuccessfulRunAt != null ||
        afterCreate.hasBuildSuccess,
    ).toBe(true);

    await dismissBlockingDialogs(page);
    await waitForComposerReady(page);

    const editPrompt = "Add a dark mode toggle to the calculator.";
    await fillAgentPrompt(page, editPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const settlement = await page.evaluate(() => {
      const diag = window.__studioTestHooks?.getFollowUpSettlementDiagnostic?.();
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const ready = window.__studioTestHooks?.getReadinessState?.();
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      return {
        projectPath: ready?.projectPath ?? null,
        createPromptLength: diag?.createPromptLength ?? null,
        followUpPromptLength: diag?.followUpPromptLength ?? null,
        submitEventId: diag?.submitEventId ?? null,
        activeRunId: pipeline?.activeAgentRunId ?? null,
        greenfieldStatus: run?.runResult ?? null,
        currentActionType: run?.actionType ?? null,
        selectedRoutingDecision:
          diag?.selectedRoutingDecision ?? run?.routeDecision?.selectedRoute ?? null,
        routingReason: diag?.routingReason ?? run?.routeDecision?.selectionReason ?? null,
        scanStatus: ready?.scanStatus ?? null,
        generateInvocations: diag?.generateInvocations ?? null,
        applyPlanInvocations: diag?.applyPlanInvocations ?? null,
        filesWritten: run?.filesWritten?.length ?? 0,
      };
    });
    expect(settlement.followUpPromptLength).toBe(editPrompt.length);
    expect(settlement.createPromptLength).toBe(createPrompt.length);
    expect(settlement.selectedRoutingDecision).not.toBe("greenfield");

    const blockMessage = await page.evaluate(() => {
      const state = window.__studioTestHooks?.getPatchPipelineState?.();
      return state?.buildError ?? state?.planApplyError ?? null;
    });
    expect(String(blockMessage ?? "")).not.toMatch(
      /Previous app generation failed before build completed/i,
    );

    const outcome = await waitForPostPatchProgress(page);
    expect([
      "waiting_for_review",
      "ready_for_apply",
      "verification_started",
      "patch_applied",
    ]).toContain(outcome);

    if (outcome === "waiting_for_review") {
      const review = page.getByTestId("agent-review-chip");
      await expect(review).toBeVisible();
      return;
    }

    if (outcome === "verification_started") {
      const applied = await waitForPatchApplied(page);
      expect(["patch_applied", "apply_failed"]).toContain(applied);
    }

    await assertNoRenderLoopConsoleErrors(page);
  });
});
