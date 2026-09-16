import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUndoBatchFromApprovedFiles,
  createFollowUpCheckpoint,
  restoreFollowUpCheckpoint,
  rollbackPartialApply,
  shouldCommitFollowUpUndo,
} from "./followUpCheckpoint.ts";
import { setForcedUndoPathFailure } from "@/core/agent/runRecoveryTestSeams";
import type { BryantLabsApi } from "@/types";

function mockDisk(initial: Record<string, string | null>) {
  const disk = new Map<string, string>();
  for (const [path, content] of Object.entries(initial)) {
    if (content !== null) disk.set(path, content);
  }
  const applyCalls: { path: string; recordUndo?: boolean }[] = [];
  const api = {
    readFile: async (absPath: string) => {
      if (!disk.has(absPath)) {
        return { readable: false, content: "", language: null, reason: "missing" };
      }
      return { readable: true, content: disk.get(absPath)!, language: "typescript" };
    },
    applyEdit: async (
      absPath: string,
      expectedBefore: string,
      after: string,
      recordUndo?: boolean,
    ) => {
      applyCalls.push(
        recordUndo === undefined
          ? { path: absPath }
          : { path: absPath, recordUndo },
      );
      if (!disk.has(absPath)) return { ok: false, reason: "File does not exist." };
      if (disk.get(absPath) !== expectedBefore) {
        return { ok: false, reason: "The file changed on disk since the patch was created." };
      }
      disk.set(absPath, after);
      return { ok: true, content: after, path: absPath };
    },
    deleteProjectFile: async (absPath: string) => {
      disk.delete(absPath);
      return { ok: true, content: "", path: absPath };
    },
    createProjectFile: async (absPath: string, content: string) => {
      if (disk.has(absPath)) return { ok: false, reason: "File already exists." };
      disk.set(absPath, content);
      return { ok: true, content, path: absPath };
    },
  } as unknown as BryantLabsApi;
  return { disk, applyCalls, api };
}

describe("followUpCheckpoint undo", () => {
  it("old checkpoint without action behaves as modify", async () => {
    const { disk, applyCalls, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new",
    });
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "edit",
      files: [
        { relPath: "src/App.tsx", absPath: "/tmp/p/src/App.tsx", content: "" },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, true);
    assert.equal(disk.has("/tmp/p/src/App.tsx"), true);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "");
    assert.equal(applyCalls[0]?.recordUndo, false);
  });

  it("checkpoint creation is deleted during Undo last change", async () => {
    const { disk, applyCalls, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new app",
      "/tmp/p/src/components/History.tsx": "created",
    });
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "add history",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old app",
          action: "modify",
        },
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          content: "",
          action: "create",
        },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, true);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "old app");
    assert.equal(disk.has("/tmp/p/src/components/History.tsx"), false);
    assert.equal(applyCalls.length, 1);
    assert.equal(applyCalls[0]?.recordUndo, false);
  });

  it("does not infer creation from empty checkpoint content", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/empty.ts": "text",
    });
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "empty",
      files: [
        { relPath: "src/empty.ts", absPath: "/tmp/p/src/empty.ts", content: "" },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, true);
    assert.equal(disk.has("/tmp/p/src/empty.ts"), true);
    assert.equal(disk.get("/tmp/p/src/empty.ts"), "");
  });

  it("buildUndoBatchFromApprovedFiles records create vs modify", () => {
    const batch = buildUndoBatchFromApprovedFiles(
      [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          action: "modify",
          basisContent: "old",
        },
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          action: "create",
          basisContent: "",
        },
      ],
      ["src/App.tsx", "src/components/History.tsx"],
    );
    assert.deepEqual(batch, [
      { path: "/tmp/p/src/App.tsx", previousContent: "old", created: false },
      {
        path: "/tmp/p/src/components/History.tsx",
        previousContent: "",
        created: true,
      },
    ]);
  });

  it("rollbackPartialApply restores modifications and deletes creations", async () => {
    const { disk, applyCalls, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new app",
      "/tmp/p/src/components/History.tsx": "created",
    });
    const result = await rollbackPartialApply(
      api,
      ["src/App.tsx", "src/components/History.tsx"],
      [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          action: "modify",
          basisContent: "old app",
        },
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          action: "create",
          basisContent: "",
        },
      ],
    );
    assert.equal(result.ok, true);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "old app");
    assert.equal(disk.has("/tmp/p/src/components/History.tsx"), false);
    assert.equal(applyCalls[0]?.recordUndo, false);
  });

  it("partial undo reports failed paths and does not claim success", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new app",
      "/tmp/p/src/components/History.tsx": "created",
    });
    api.deleteProjectFile = async () => ({
      ok: false,
      reason: "locked",
    });
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "add history",
      applyRunId: "apply-1",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old app",
          action: "modify",
        },
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          content: "",
          action: "create",
        },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, false);
    assert.equal(shouldCommitFollowUpUndo(result), false);
    assert.equal(result.compensationOk, true);
    assert.equal(result.failed[0]?.relPath, "src/components/History.tsx");
    assert.match(result.error ?? "", /History\.tsx/);
    assert.match(result.error ?? "", /locked/);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "new app");
    assert.equal(disk.has("/tmp/p/src/components/History.tsx"), true);
  });

  it("forced undo path failure keeps remaining files and reports the path", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new",
      "/tmp/p/src/components/History.tsx": "created",
    });
    setForcedUndoPathFailure("src/components/History.tsx");
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "add history",
      applyRunId: "apply-1",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old",
          action: "modify",
        },
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          content: "",
          action: "create",
        },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, false);
    assert.equal(shouldCommitFollowUpUndo(result), false);
    assert.equal(result.failed[0]?.relPath, "src/components/History.tsx");
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "new");
    assert.equal(disk.has("/tmp/p/src/components/History.tsx"), true);
    assert.match(result.error ?? "", /History\.tsx/);
    assert.match(result.error ?? "", /Compensation succeeded/);
  });

  it("follow-up checkpoint uses all-or-nothing compensation", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new app",
      "/tmp/p/src/components/History.tsx": "created",
    });
    let failHistory = true;
    const originalDelete = api.deleteProjectFile;
    api.deleteProjectFile = async (absPath: string) => {
      if (failHistory && absPath.endsWith("History.tsx")) {
        return { ok: false, reason: "injected later-path failure" };
      }
      return originalDelete(absPath);
    };
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "add history",
      applyRunId: "apply-1",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old app",
          action: "modify",
        },
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          content: "",
          action: "create",
        },
      ],
    });
    const first = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(first.ok, false);
    assert.equal(first.compensationOk, true);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "new app");
    assert.equal(disk.get("/tmp/p/src/components/History.tsx"), "created");
    failHistory = false;
    const retry = await restoreFollowUpCheckpoint(api, {
      ...checkpoint,
      ...(first.attemptBasis ? { undoAttemptBasis: first.attemptBasis } : {}),
    });
    assert.equal(retry.ok, true);
    assert.equal(shouldCommitFollowUpUndo(retry), true);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "old app");
    assert.equal(disk.has("/tmp/p/src/components/History.tsx"), false);
  });

  it("follow-up retry does not overwrite a user edit after a failed attempt", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new app",
      "/tmp/p/src/components/History.tsx": "created",
    });
    setForcedUndoPathFailure("src/components/History.tsx");
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "add history",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old app",
          action: "modify",
        },
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          content: "",
          action: "create",
        },
      ],
    });
    const first = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(first.compensationOk, true);
    disk.set("/tmp/p/src/App.tsx", "user edit");
    const retry = await restoreFollowUpCheckpoint(api, {
      ...checkpoint,
      ...(first.attemptBasis ? { undoAttemptBasis: first.attemptBasis } : {}),
    });
    assert.equal(retry.ok, false);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "user edit");
    assert.equal(disk.get("/tmp/p/src/components/History.tsx"), "created");
    assert.match(retry.error ?? "", /changed since the last undo attempt/);
  });

  it("follow-up duplicate paths are rejected before mutation", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new",
    });
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "dup",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old",
          action: "modify",
        },
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/./App.tsx",
          content: "other",
          action: "modify",
        },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Duplicate undo path/);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "new");
  });

  it("follow-up containment failure changes nothing", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new",
    });
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "escape",
      files: [
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/other/App.tsx",
          content: "old",
          action: "modify",
        },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /outside the project root/);
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "new");
  });

  it("follow-up later-path failure recreates an earlier deleted create", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new app",
      "/tmp/p/src/components/History.tsx": "created",
    });
    api.applyEdit = async (absPath, _expectedBefore, after) => {
      if (absPath.endsWith("App.tsx") && after === "old app") {
        return { ok: false, reason: "injected later-path failure" };
      }
      disk.set(absPath, after);
      return { ok: true, content: after, path: absPath };
    };
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "add history",
      files: [
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          content: "",
          action: "create",
        },
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old app",
          action: "modify",
        },
      ],
    });
    const result = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(result.ok, false);
    assert.equal(result.compensationOk, true);
    assert.equal(disk.get("/tmp/p/src/components/History.tsx"), "created");
    assert.equal(disk.get("/tmp/p/src/App.tsx"), "new app");
  });

  it("follow-up does not delete a user-recreated file on retry", async () => {
    const { disk, api } = mockDisk({
      "/tmp/p/src/App.tsx": "new app",
      "/tmp/p/src/components/History.tsx": "created",
    });
    api.applyEdit = async (absPath, _expectedBefore, after) => {
      if (absPath.endsWith("App.tsx") && after === "old app") {
        return { ok: false, reason: "injected later-path failure" };
      }
      disk.set(absPath, after);
      return { ok: true, content: after, path: absPath };
    };
    const checkpoint = createFollowUpCheckpoint({
      projectPath: "/tmp/p",
      prompt: "add history",
      files: [
        {
          relPath: "src/components/History.tsx",
          absPath: "/tmp/p/src/components/History.tsx",
          content: "",
          action: "create",
        },
        {
          relPath: "src/App.tsx",
          absPath: "/tmp/p/src/App.tsx",
          content: "old app",
          action: "modify",
        },
      ],
    });
    const first = await restoreFollowUpCheckpoint(api, checkpoint);
    assert.equal(first.compensationOk, true);
    disk.set("/tmp/p/src/components/History.tsx", "user-recreated");
    const retry = await restoreFollowUpCheckpoint(api, {
      ...checkpoint,
      ...(first.attemptBasis ? { undoAttemptBasis: first.attemptBasis } : {}),
    });
    assert.equal(retry.ok, false);
    assert.equal(disk.get("/tmp/p/src/components/History.tsx"), "user-recreated");
    assert.match(retry.error ?? "", /changed since the last undo attempt/);
  });
});
