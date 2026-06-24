import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_FOLDER_GREENFIELD_MESSAGE } from "@/core/agent/agentGreenfieldDispatch";
import {
  FOLDER_SELECTION_GATE_COPY,
  isNoProjectBlockedReason,
  planPendingFolderResume,
  resolveFolderGateCancel,
  resolveNoProjectSubmit,
  resolveResumeModeOverride,
  shouldInterceptPromptWithoutProject,
  shouldResumePendingPrompt,
} from "@/core/agent/folderSelectionGate";

describe("folderSelectionGate", () => {
  it("no folder + prompt → intercept and show start/open gate", () => {
    assert.equal(shouldInterceptPromptWithoutProject(false), true);
    assert.equal(shouldInterceptPromptWithoutProject(true), false);

    const result = resolveNoProjectSubmit({
      hasProject: false,
      trimmed: "Build a CRM dashboard with auth",
    });
    assert.equal(result.kind, "show_folder_gate");
    if (result.kind !== "show_folder_gate") return;
    assert.equal(result.pendingPrompt, "Build a CRM dashboard with auth");
    assert.match(FOLDER_SELECTION_GATE_COPY.title, /where should we build/i);
    assert.match(FOLDER_SELECTION_GATE_COPY.startNewLabel, /start new project/i);
    assert.match(FOLDER_SELECTION_GATE_COPY.openExistingLabel, /open existing/i);

    const editStyle = resolveNoProjectSubmit({
      hasProject: false,
      trimmed: "Fix the login bug",
    });
    assert.equal(editStyle.kind, "show_folder_gate");
  });

  it("Start New Project preserves prompt and plans greenfield resume", () => {
    const pending = {
      pendingPrompt: "Create a habit tracker",
      destination: "start_new" as const,
    };
    assert.equal(
      shouldResumePendingPrompt({
        pending,
        hasProject: true,
        scanStatus: "scanning",
      }),
      true,
    );
    const plan = planPendingFolderResume({ pending, modeOverride: "auto" });
    assert.equal(plan.prompt, "Create a habit tracker");
    assert.equal(plan.modeOverride, "new_app");
    assert.equal(resolveResumeModeOverride("start_new", "edit"), "new_app");
  });

  it("Open Existing Folder preserves prompt and waits for scan", () => {
    const pending = {
      pendingPrompt: "Add dark mode toggle",
      destination: "open_existing" as const,
    };
    assert.equal(
      shouldResumePendingPrompt({
        pending,
        hasProject: true,
        scanStatus: "scanning",
      }),
      false,
    );
    assert.equal(
      shouldResumePendingPrompt({
        pending,
        hasProject: true,
        scanStatus: "done",
      }),
      true,
    );
    const plan = planPendingFolderResume({ pending, modeOverride: "auto" });
    assert.equal(plan.prompt, "Add dark mode toggle");
    assert.equal(plan.modeOverride, "auto");
  });

  it("Cancel preserves prompt and does not run", () => {
    const cancel = resolveFolderGateCancel({ pendingPrompt: "Build a notes app" });
    assert.equal(cancel.prompt, "Build a notes app");
    assert.equal(cancel.shouldRun, false);
    assert.equal(
      shouldResumePendingPrompt({
        pending: null,
        hasProject: false,
        scanStatus: "idle",
      }),
      false,
    );
  });

  it("recognizes legacy no-project blocked messages for suppression", () => {
    assert.equal(
      isNoProjectBlockedReason(
        "Open a project folder to edit or repair the current app.",
      ),
      true,
    );
    assert.equal(isNoProjectBlockedReason(NO_FOLDER_GREENFIELD_MESSAGE), true);
    assert.equal(
      isNoProjectBlockedReason(
        'Describe the app you want to build (e.g. "Build a CRM dashboard"), or open an existing project folder.',
      ),
      true,
    );
    assert.equal(
      isNoProjectBlockedReason("Connect an AI provider in Settings before sending prompts."),
      false,
    );
    assert.equal(resolveNoProjectSubmit({ hasProject: true, trimmed: "Hi" }).kind, "continue");
  });
});
