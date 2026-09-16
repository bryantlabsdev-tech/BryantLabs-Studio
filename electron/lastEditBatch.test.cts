import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  applyUndoBatch,
  createFsUndoIo,
  createLastEditStore,
  parseUndoBatchEntries,
  type LastEditRecord,
  type UndoBatchIo,
} from "./lastEditBatch.cjs";
import {
  applyEdit,
  createProjectFile,
  writeVerified,
  PATH_OUTSIDE_PROJECT_ROOT,
} from "./fileWriter.cjs";

function memoryIo(
  disk: Map<string, string | null>,
  opts?: {
    failWrite?: (filePath: string, content: string) => string | null;
    failDelete?: (filePath: string) => string | null;
    failValidate?: (filePath: string) => string | null;
    failSnapshot?: (filePath: string) => string | null;
    shouldFail?: (filePath: string) => boolean;
  },
) {
  const notifications: { path: string; deleted: boolean }[] = [];
  const io: UndoBatchIo = {
    writeVerified: async (_root, filePath, content) => {
      const forced = opts?.failWrite?.(filePath, content);
      if (forced) return { ok: false, reason: forced };
      disk.set(filePath, content);
      return { ok: true, content };
    },
    deleteProjectFile: async (_root, filePath) => {
      const forced = opts?.failDelete?.(filePath);
      if (forced) return { ok: false, reason: forced };
      disk.delete(filePath);
      return { ok: true, content: "" };
    },
    notifyIndexFileChange: (filePath, deleted = false) => {
      notifications.push({ path: filePath, deleted });
    },
    validateTarget: async (_root, filePath) => {
      const forced = opts?.failValidate?.(filePath);
      if (forced) return { ok: false, reason: forced };
      return { ok: true };
    },
    readSnapshot: async (_root, filePath) => {
      const forced = opts?.failSnapshot?.(filePath);
      if (forced) return { ok: false, reason: forced };
      if (!disk.has(filePath)) return { ok: true, existed: false, content: "" };
      return { ok: true, existed: true, content: disk.get(filePath) ?? "" };
    },
    shouldFail: opts?.shouldFail,
  };
  return { io, notifications };
}

describe("lastEditBatch", () => {
  it("parses a valid batch and rejects invalid entries", () => {
    const ok = parseUndoBatchEntries([
      { path: "/p/a.ts", previousContent: "old", created: false },
    ]);
    assert.equal(ok.ok, true);
    const bad = parseUndoBatchEntries([{ path: "/p/a.ts", previousContent: "", created: "yes" }]);
    assert.equal(bad.ok, false);
  });

  it("creation undo deletes the file", async () => {
    const disk = new Map<string, string | null>([["/p/New.tsx", "created"]]);
    const { io, notifications } = memoryIo(disk);
    const result = await applyUndoBatch(null, [
      { path: "/p/New.tsx", previousContent: "", created: true },
    ], io);
    assert.equal(result.ok, true);
    assert.equal(disk.has("/p/New.tsx"), false);
    assert.deepEqual(notifications, [{ path: "/p/New.tsx", deleted: true }]);
  });

  it("modification undo restores the original content", async () => {
    const disk = new Map<string, string | null>([["/p/App.tsx", "new"]]);
    const { io, notifications } = memoryIo(disk);
    const result = await applyUndoBatch(null, [
      { path: "/p/App.tsx", previousContent: "old", created: false },
    ], io);
    assert.equal(result.ok, true);
    assert.equal(disk.get("/p/App.tsx"), "old");
    assert.deepEqual(notifications, [{ path: "/p/App.tsx", deleted: false }]);
  });

  it("mixed create/modify batch restores all entries in reverse", async () => {
    const disk = new Map<string, string | null>([
      ["/p/App.tsx", "new-app"],
      ["/p/New.tsx", "created"],
    ]);
    const { io, notifications } = memoryIo(disk);
    const batch: LastEditRecord[] = [
      { path: "/p/App.tsx", previousContent: "old-app", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ];
    const result = await applyUndoBatch(null, batch, io);
    assert.equal(result.ok, true);
    assert.equal(disk.get("/p/App.tsx"), "old-app");
    assert.equal(disk.has("/p/New.tsx"), false);
    assert.deepEqual(notifications, [
      { path: "/p/New.tsx", deleted: true },
      { path: "/p/App.tsx", deleted: false },
    ]);
  });

  it("an existing empty file is restored and not deleted", async () => {
    const disk = new Map<string, string | null>([["/p/empty.ts", "now has text"]]);
    const { io } = memoryIo(disk);
    const result = await applyUndoBatch(null, [
      { path: "/p/empty.ts", previousContent: "", created: false },
    ], io);
    assert.equal(result.ok, true);
    assert.equal(disk.has("/p/empty.ts"), true);
    assert.equal(disk.get("/p/empty.ts"), "");
  });

  it("a second successful operation replaces the first batch", () => {
    const store = createLastEditStore();
    store.recordSingle({ path: "/p/a.ts", previousContent: "a", created: false });
    store.replace([
      { path: "/p/b.ts", previousContent: "b", created: false },
      { path: "/p/c.ts", previousContent: "", created: true },
    ]);
    assert.equal(store.peek()?.length, 2);
    assert.equal(store.peek()?.[0]?.path, "/p/b.ts");
  });

  it("project switching clears the batch", () => {
    const store = createLastEditStore();
    store.recordSingle({ path: "/p/a.ts", previousContent: "a", created: false });
    store.clear();
    assert.equal(store.peek(), null);
  });

  it("undo does not create an undo-of-undo record", async () => {
    const disk = new Map<string, string | null>([["/p/App.tsx", "new"]]);
    const { io } = memoryIo(disk);
    const store = createLastEditStore();
    store.recordSingle({ path: "/p/App.tsx", previousContent: "old", created: false });
    const first = await store.undo(null, io);
    assert.equal(first.ok, true);
    assert.equal(store.peek(), null);
    const second = await store.undo(null, io);
    assert.equal(second.ok, false);
    assert.match(second.reason ?? "", /Nothing to undo/);
    assert.equal(disk.get("/p/App.tsx"), "old");
  });

  it("later-path restore failure compensates a deleted created file", async () => {
    const disk = new Map<string, string | null>([
      ["/p/App.tsx", "new-app"],
      ["/p/New.tsx", "created"],
    ]);
    const { io } = memoryIo(disk, {
      failWrite: (filePath, content) =>
        filePath === "/p/App.tsx" && content === "old-app" ? "injected restore failure" : null,
    });
    const store = createLastEditStore();
    store.replace([
      { path: "/p/App.tsx", previousContent: "old-app", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ]);
    const result = await store.undo(null, io);
    assert.equal(result.ok, false);
    assert.equal(result.compensationOk, true);
    assert.equal(disk.get("/p/New.tsx"), "created");
    assert.equal(disk.get("/p/App.tsx"), "new-app");
    assert.ok(store.peek());
    assert.match(result.reason ?? "", /App\.tsx/);
    assert.match(result.reason ?? "", /Compensation succeeded/);
  });

  it("later-path failure compensates an earlier restored modify", async () => {
    const disk = new Map<string, string | null>([
      ["/p/a.ts", "a-new"],
      ["/p/b.ts", "b-new"],
    ]);
    const { io } = memoryIo(disk, {
      failWrite: (filePath, content) =>
        filePath === "/p/a.ts" && content === "a-old" ? "injected restore failure" : null,
    });
    const result = await applyUndoBatch(null, [
      { path: "/p/a.ts", previousContent: "a-old", created: false },
      { path: "/p/b.ts", previousContent: "b-old", created: false },
    ], io);
    assert.equal(result.ok, false);
    assert.equal(disk.get("/p/b.ts"), "b-new");
    assert.equal(disk.get("/p/a.ts"), "a-new");
    assert.equal(result.compensationOk, true);
  });

  it("snapshot or containment failure before mutation changes nothing", async () => {
    const disk = new Map<string, string | null>([
      ["/p/App.tsx", "new-app"],
      ["/p/New.tsx", "created"],
    ]);
    const batch: LastEditRecord[] = [
      { path: "/p/App.tsx", previousContent: "old-app", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ];
    const blocked = memoryIo(disk, {
      failValidate: (filePath) => (filePath === "/p/New.tsx" ? PATH_OUTSIDE_PROJECT_ROOT : null),
    });
    const validateResult = await applyUndoBatch(null, batch, blocked.io);
    assert.equal(validateResult.ok, false);
    assert.equal(validateResult.reason, PATH_OUTSIDE_PROJECT_ROOT);
    assert.equal(disk.get("/p/App.tsx"), "new-app");
    assert.equal(disk.get("/p/New.tsx"), "created");

    const snapFail = memoryIo(disk, {
      failSnapshot: (filePath) => (filePath === "/p/App.tsx" ? "snapshot blocked" : null),
    });
    const snapResult = await applyUndoBatch(null, batch, snapFail.io);
    assert.equal(snapResult.ok, false);
    assert.match(snapResult.reason ?? "", /snapshot blocked/);
    assert.equal(disk.get("/p/App.tsx"), "new-app");
    assert.equal(disk.get("/p/New.tsx"), "created");
  });

  it("compensation write failure reports original and dirty paths", async () => {
    const disk = new Map<string, string | null>([
      ["/p/App.tsx", "new-app"],
      ["/p/New.tsx", "created"],
    ]);
    const { io } = memoryIo(disk, {
      failWrite: (filePath, content) => {
        if (filePath === "/p/App.tsx" && content === "old-app") return "injected restore failure";
        if (filePath === "/p/New.tsx" && content === "created") return "compensation blocked";
        return null;
      },
    });
    const store = createLastEditStore();
    store.replace([
      { path: "/p/App.tsx", previousContent: "old-app", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ]);
    const result = await store.undo(null, io);
    assert.equal(result.ok, false);
    assert.equal(result.compensationOk, false);
    assert.equal(disk.has("/p/New.tsx"), false);
    assert.equal(disk.get("/p/App.tsx"), "new-app");
    assert.match(result.reason ?? "", /injected restore failure/);
    assert.match(result.reason ?? "", /compensation blocked/);
    assert.match(result.reason ?? "", /Remaining dirty paths/);
    assert.ok(result.dirtyPaths?.some((p) => p.endsWith("New.tsx")));
    assert.ok(store.peek());
  });

  it("retry after fully compensated failure can succeed", async () => {
    const disk = new Map<string, string | null>([
      ["/p/App.tsx", "new-app"],
      ["/p/New.tsx", "created"],
    ]);
    let failApp = true;
    const { io } = memoryIo(disk, {
      failWrite: (filePath, content) =>
        failApp && filePath === "/p/App.tsx" && content === "old-app"
          ? "injected restore failure"
          : null,
    });
    const store = createLastEditStore();
    store.replace([
      { path: "/p/App.tsx", previousContent: "old-app", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ]);
    const first = await store.undo(null, io);
    assert.equal(first.ok, false);
    assert.equal(first.compensationOk, true);
    failApp = false;
    const second = await store.undo(null, io);
    assert.equal(second.ok, true);
    assert.equal(disk.get("/p/App.tsx"), "old-app");
    assert.equal(disk.has("/p/New.tsx"), false);
    assert.equal(store.peek(), null);
  });

  it("does not delete a user-recreated created file on retry", async () => {
    const disk = new Map<string, string | null>([
      ["/p/App.tsx", "new-app"],
      ["/p/New.tsx", "created"],
    ]);
    const { io } = memoryIo(disk, {
      failWrite: (filePath, content) =>
        filePath === "/p/App.tsx" && content === "old-app" ? "injected restore failure" : null,
    });
    const store = createLastEditStore();
    store.replace([
      { path: "/p/App.tsx", previousContent: "old-app", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ]);
    const first = await store.undo(null, io);
    assert.equal(first.compensationOk, true);
    disk.set("/p/New.tsx", "user-recreated");
    const second = await store.undo(null, io);
    assert.equal(second.ok, false);
    assert.equal(disk.get("/p/New.tsx"), "user-recreated");
    assert.equal(disk.get("/p/App.tsx"), "new-app");
    assert.match(second.reason ?? "", /changed since the last undo attempt/);
    assert.ok(store.peek());
  });

  it("does not overwrite a user edit made after a failed attempt", async () => {
    const disk = new Map<string, string | null>([
      ["/p/App.tsx", "new-app"],
      ["/p/New.tsx", "created"],
    ]);
    const { io } = memoryIo(disk, {
      failWrite: (filePath, content) =>
        filePath === "/p/App.tsx" && content === "old-app" ? "injected restore failure" : null,
    });
    const store = createLastEditStore();
    store.replace([
      { path: "/p/App.tsx", previousContent: "old-app", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ]);
    await store.undo(null, io);
    disk.set("/p/App.tsx", "user-edit");
    const second = await store.undo(null, io);
    assert.equal(second.ok, false);
    assert.equal(disk.get("/p/App.tsx"), "user-edit");
    assert.equal(disk.get("/p/New.tsx"), "created");
    assert.match(second.reason ?? "", /changed since the last undo attempt/);
  });

  it("rejects duplicate paths before mutation", async () => {
    const disk = new Map<string, string | null>([["/p/a.ts", "new"]]);
    const { io } = memoryIo(disk);
    const result = await applyUndoBatch(null, [
      { path: "/p/a.ts", previousContent: "old", created: false },
      { path: "/p/./a.ts", previousContent: "other", created: false },
    ], io);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Duplicate undo path/);
    assert.equal(disk.get("/p/a.ts"), "new");
  });

  it("deleting an already-absent created file is successful", async () => {
    const disk = new Map<string, string | null>([["/p/App.tsx", "new"]]);
    const { io } = memoryIo(disk);
    const result = await applyUndoBatch(null, [
      { path: "/p/App.tsx", previousContent: "old", created: false },
      { path: "/p/New.tsx", previousContent: "", created: true },
    ], io);
    assert.equal(result.ok, true);
    assert.equal(disk.get("/p/App.tsx"), "old");
    assert.equal(disk.has("/p/New.tsx"), false);
  });
});

describe("lastEditBatch disk", () => {
  it("create then undo leaves the path absent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-undo-create-"));
    const created = path.join(root, "src", "New.tsx");
    const store = createLastEditStore();
    const result = await createProjectFile(root, created, "export const n = 1;\n");
    assert.equal(result.ok, true);
    store.recordSingle({ path: created, previousContent: "", created: true });
    const undo = await store.undo(root, createFsUndoIo(() => {}));
    assert.equal(undo.ok, true);
    await assert.rejects(fs.stat(created), /ENOENT/);
  });

  it("modify then undo restores the original bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-undo-mod-"));
    const filePath = path.join(root, "App.tsx");
    await fs.writeFile(filePath, "old\n", "utf8");
    const edited = await applyEdit(root, filePath, "old\n", "new\n");
    assert.equal(edited.ok, true);
    const store = createLastEditStore();
    store.recordSingle({
      path: filePath,
      previousContent: edited.previousContent ?? "",
      created: false,
    });
    const undo = await store.undo(root, createFsUndoIo(() => {}));
    assert.equal(undo.ok, true);
    assert.equal(await fs.readFile(filePath, "utf8"), "old\n");
  });

  it("mixed batch reverses all changes on disk", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-undo-mix-"));
    const appPath = path.join(root, "src", "App.tsx");
    const newPath = path.join(root, "src", "components", "History.tsx");
    await fs.mkdir(path.dirname(appPath), { recursive: true });
    await fs.writeFile(appPath, "old app\n", "utf8");
    await applyEdit(root, appPath, "old app\n", "new app\n");
    await createProjectFile(root, newPath, "export function History() { return null; }\n");
    const store = createLastEditStore();
    store.replace([
      { path: appPath, previousContent: "old app\n", created: false },
      { path: newPath, previousContent: "", created: true },
    ]);
    const notifications: { path: string; deleted: boolean }[] = [];
    const undo = await store.undo(root, createFsUndoIo((filePath, deleted = false) => {
        notifications.push({ path: filePath, deleted });
      }));
    assert.equal(undo.ok, true);
    assert.equal(await fs.readFile(appPath, "utf8"), "old app\n");
    await assert.rejects(fs.stat(newPath), /ENOENT/);
    assert.equal(notifications.some((n) => n.path === newPath && n.deleted), true);
    assert.equal(notifications.some((n) => n.path === appPath && !n.deleted), true);
    assert.equal(store.peek(), null);
  });

  it("undo cannot mutate an outside sentinel through a parent symlink", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bl-undo-link-proj-"));
    const outside = await mkdtemp(path.join(tmpdir(), "bl-undo-link-out-"));
    const sentinel = path.join(outside, "SENTINEL.txt");
    await fs.writeFile(sentinel, "untouched\n", "utf8");
    const created = path.join(project, "src", "New.tsx");
    const made = await createProjectFile(project, created, "export const n = 1;\n");
    assert.equal(made.ok, true);
    await fs.rename(path.join(project, "src"), path.join(project, "src-real"));
    await fs.symlink(outside, path.join(project, "src"));
    const store = createLastEditStore();
    store.recordSingle({ path: created, previousContent: "", created: true });
    const undo = await store.undo(project, createFsUndoIo(() => {}));
    assert.equal(undo.ok, false);
    assert.equal(undo.reason, PATH_OUTSIDE_PROJECT_ROOT);
    assert.equal(await fs.readFile(sentinel, "utf8"), "untouched\n");
  });

  it("undo restore cannot write through an outside-pointing parent symlink", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bl-undo-restore-proj-"));
    const outside = await mkdtemp(path.join(tmpdir(), "bl-undo-restore-out-"));
    const sentinel = path.join(outside, "SENTINEL.txt");
    await fs.writeFile(sentinel, "untouched\n", "utf8");
    await fs.writeFile(path.join(outside, "App.tsx"), "outside-app\n", "utf8");
    const filePath = path.join(project, "src", "App.tsx");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "old\n", "utf8");
    const edited = await applyEdit(project, filePath, "old\n", "new\n");
    assert.equal(edited.ok, true);
    await fs.rename(path.join(project, "src"), path.join(project, "src-real"));
    await fs.symlink(outside, path.join(project, "src"));
    const store = createLastEditStore();
    store.recordSingle({
      path: filePath,
      previousContent: edited.previousContent ?? "",
      created: false,
    });
    const undo = await store.undo(project, createFsUndoIo(() => {}));
    assert.equal(undo.ok, false);
    assert.equal(undo.reason, PATH_OUTSIDE_PROJECT_ROOT);
    assert.equal(await fs.readFile(sentinel, "utf8"), "untouched\n");
    assert.equal(await fs.readFile(path.join(outside, "App.tsx"), "utf8"), "outside-app\n");
  });

  it("mixed create + modify batch succeeds fully", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-undo-tx-mix-"));
    const appPath = path.join(root, "src", "App.tsx");
    const newPath = path.join(root, "src", "New.tsx");
    await fs.mkdir(path.dirname(appPath), { recursive: true });
    await fs.writeFile(appPath, "old app\n", "utf8");
    await applyEdit(root, appPath, "old app\n", "new app\n");
    await createProjectFile(root, newPath, "created\n");
    const store = createLastEditStore();
    store.replace([
      { path: appPath, previousContent: "old app\n", created: false },
      { path: newPath, previousContent: "", created: true },
    ]);
    const undo = await store.undo(root, createFsUndoIo(() => {}));
    assert.equal(undo.ok, true);
    assert.equal(await fs.readFile(appPath, "utf8"), "old app\n");
    await assert.rejects(fs.stat(newPath), /ENOENT/);
    assert.equal(store.peek(), null);
  });

  it("edit:undoLast-style later-path failure restores the pre-undo snapshot", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-undo-ipc-fail-"));
    const appPath = path.join(root, "src", "App.tsx");
    const newPath = path.join(root, "src", "New.tsx");
    await fs.mkdir(path.dirname(appPath), { recursive: true });
    await fs.writeFile(appPath, "old app\n", "utf8");
    await applyEdit(root, appPath, "old app\n", "new app\n");
    await createProjectFile(root, newPath, "created\n");
    const preUndo = {
      app: await fs.readFile(appPath, "utf8"),
      created: await fs.readFile(newPath, "utf8"),
    };
    const store = createLastEditStore();
    store.replace([
      { path: appPath, previousContent: "old app\n", created: false },
      { path: newPath, previousContent: "", created: true },
    ]);
    const undo = await store.undo(
      root,
      createFsUndoIo(() => {}, {
        writeVerified: async (projRoot, filePath, content) => {
          if (filePath === appPath && content === "old app\n") {
            return { ok: false, reason: "injected later-path failure" };
          }
          return writeVerified(projRoot, filePath, content);
        },
      }),
    );
    const mapped = undo.ok
      ? { ok: true as const, content: undo.content, path: undo.path }
      : { ok: false as const, reason: undo.reason, path: undo.path };
    assert.equal(mapped.ok, false);
    assert.match(mapped.reason ?? "", /injected later-path failure/);
    assert.equal(await fs.readFile(appPath, "utf8"), preUndo.app);
    assert.equal(await fs.readFile(newPath, "utf8"), preUndo.created);
    assert.ok(store.peek());
  });

  it("incomplete compensation reports dirty paths and retains undo", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-undo-ipc-dirty-"));
    const appPath = path.join(root, "src", "App.tsx");
    const newPath = path.join(root, "src", "New.tsx");
    await fs.mkdir(path.dirname(appPath), { recursive: true });
    await fs.writeFile(appPath, "old app\n", "utf8");
    await applyEdit(root, appPath, "old app\n", "new app\n");
    await createProjectFile(root, newPath, "created\n");
    const store = createLastEditStore();
    store.replace([
      { path: appPath, previousContent: "old app\n", created: false },
      { path: newPath, previousContent: "", created: true },
    ]);
    const undo = await store.undo(
      root,
      createFsUndoIo(() => {}, {
        writeVerified: async (projRoot, filePath, content) => {
          if (filePath === appPath && content === "old app\n") {
            return { ok: false, reason: "injected later-path failure" };
          }
          if (filePath === newPath && content === "created\n") {
            return { ok: false, reason: "compensation blocked" };
          }
          return writeVerified(projRoot, filePath, content);
        },
      }),
    );
    assert.equal(undo.ok, false);
    assert.equal(undo.compensationOk, false);
    assert.match(undo.reason ?? "", /injected later-path failure/);
    assert.match(undo.reason ?? "", /compensation blocked/);
    assert.match(undo.reason ?? "", /Remaining dirty paths/);
    await assert.rejects(fs.stat(newPath), /ENOENT/);
    assert.ok(store.peek());
  });
});
