import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GIT_BRANCH_IPC_FAILURE_MESSAGE,
  isBackdropDismissTarget,
  nextDialogControl,
} from "@/components/views/gitConfirmDialog";

describe("git confirm dialog helpers", () => {
  it("closes on backdrop clicks only when the target is the backdrop", () => {
    const backdrop = { id: "backdrop" } as unknown as EventTarget;
    const dialog = { id: "dialog" } as unknown as EventTarget;
    assert.equal(isBackdropDismissTarget(backdrop, backdrop), true);
    assert.equal(isBackdropDismissTarget(dialog, backdrop), false);
  });

  it("cycles Tab between Cancel and Confirm", () => {
    assert.equal(nextDialogControl("cancel", false), "confirm");
    assert.equal(nextDialogControl("confirm", false), "cancel");
    assert.equal(nextDialogControl("cancel", true), "confirm");
  });

  it("uses a bounded generic IPC failure message", () => {
    assert.equal(GIT_BRANCH_IPC_FAILURE_MESSAGE.includes("/"), false);
    assert.ok(GIT_BRANCH_IPC_FAILURE_MESSAGE.length < 80);
  });
});
