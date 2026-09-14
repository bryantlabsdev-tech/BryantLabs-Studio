import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  validateWritePath,
  writeVerified,
  createProjectFile,
  deleteProjectFile,
  applyEdit,
  isCanonicalPathWithinRoot,
  PATH_OUTSIDE_PROJECT_ROOT,
} from "./fileWriter.cjs";

async function makeProjectPair(): Promise<{
  project: string;
  outside: string;
  sentinel: string;
}> {
  const project = await mkdtemp(path.join(tmpdir(), "bl-contain-proj-"));
  const outside = await mkdtemp(path.join(tmpdir(), "bl-contain-out-"));
  const sentinel = path.join(outside, "SENTINEL.txt");
  await fs.writeFile(sentinel, "untouched\n", "utf8");
  return { project, outside, sentinel };
}

async function readSentinel(sentinel: string): Promise<string> {
  return fs.readFile(sentinel, "utf8");
}

describe("fileWriter safety", () => {
  it("blocks paths outside the project root", () => {
    const root = "/tmp/project";
    const result = validateWritePath(root, "/tmp/other/file.ts");
    assert.equal(result.ok, false);
    assert.equal(result.reason, PATH_OUTSIDE_PROJECT_ROOT);
  });

  it("blocks node_modules writes", () => {
    const root = "/tmp/project";
    const result = validateWritePath(
      root,
      path.join(root, "node_modules/pkg/index.js"),
    );
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /node_modules/);
  });

  it("blocks package-lock.json", () => {
    const root = "/tmp/project";
    const result = validateWritePath(
      root,
      path.join(root, "package-lock.json"),
    );
    assert.equal(result.ok, false);
  });

  it("writes and verifies a new file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-writer-"));
    const filePath = path.join(root, "src", "hello.ts");
    const result = await createProjectFile(root, filePath, "export const x = 1;\n");
    assert.equal(result.ok, true);
    const onDisk = await fs.readFile(filePath, "utf8");
    assert.equal(onDisk, "export const x = 1;\n");
  });

  it("rejects overwriting an existing file via createProjectFile", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-writer-"));
    const filePath = path.join(root, "exists.ts");
    await fs.writeFile(filePath, "old", "utf8");
    const result = await createProjectFile(root, filePath, "new");
    assert.equal(result.ok, false);
  });

  it("writeVerified round-trips content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-writer-"));
    const filePath = path.join(root, "note.txt");
    await fs.mkdir(root, { recursive: true });
    const result = await writeVerified(root, filePath, "hello");
    assert.equal(result.ok, true);
    assert.equal(await fs.readFile(filePath, "utf8"), "hello");
  });

  it("treats deleting a missing file as success", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-writer-"));
    const filePath = path.join(root, "gone.ts");
    const result = await deleteProjectFile(root, filePath);
    assert.equal(result.ok, true);
  });
});

describe("canonical path containment", () => {
  it("rejects lexical ../ traversal", async () => {
    const { project, outside, sentinel } = await makeProjectPair();
    const escaped = path.join(project, "..", path.basename(outside), "SENTINEL.txt");
    const written = await writeVerified(project, escaped, "pwned\n");
    assert.equal(written.ok, false);
    assert.equal(written.reason, PATH_OUTSIDE_PROJECT_ROOT);
    assert.equal(await readSentinel(sentinel), "untouched\n");
  });

  it("rejects sibling-prefix paths", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bl-prefix-"));
    const sibling = `${project}-evil`;
    await fs.mkdir(sibling);
    const target = path.join(sibling, "file.ts");
    const result = validateWritePath(project, target);
    assert.equal(result.ok, false);
    assert.equal(result.reason, PATH_OUTSIDE_PROJECT_ROOT);
  });

  it("rejects write, create, and delete through a parent directory symlink pointing outside", async () => {
    const { project, outside, sentinel } = await makeProjectPair();
    const src = path.join(project, "src");
    await fs.symlink(outside, src);
    const dest = path.join(src, "App.tsx");

    const written = await writeVerified(project, dest, "pwned\n");
    assert.equal(written.ok, false);
    assert.equal(written.reason, PATH_OUTSIDE_PROJECT_ROOT);

    const created = await createProjectFile(project, dest, "pwned\n");
    assert.equal(created.ok, false);
    assert.equal(created.reason, PATH_OUTSIDE_PROJECT_ROOT);

    const deleted = await deleteProjectFile(project, dest);
    assert.equal(deleted.ok, false);
    assert.equal(deleted.reason, PATH_OUTSIDE_PROJECT_ROOT);

    assert.equal(await readSentinel(sentinel), "untouched\n");
    await assert.rejects(fs.stat(path.join(outside, "App.tsx")), /ENOENT/);
  });

  it("rejects write through an existing destination file symlink pointing outside; delete removes only the link", async () => {
    const { project, sentinel } = await makeProjectPair();
    const link = path.join(project, "App.tsx");
    await fs.symlink(sentinel, link);

    const written = await writeVerified(project, link, "pwned\n");
    assert.equal(written.ok, false);
    assert.equal(written.reason, PATH_OUTSIDE_PROJECT_ROOT);
    assert.equal(await readSentinel(sentinel), "untouched\n");

    const deleted = await deleteProjectFile(project, link);
    assert.equal(deleted.ok, true);
    await assert.rejects(fs.lstat(link), /ENOENT/);
    assert.equal(await readSentinel(sentinel), "untouched\n");
  });

  it("rejects write/create through a dangling destination symlink pointing outside", async () => {
    const { project, outside, sentinel } = await makeProjectPair();
    const missing = path.join(outside, "missing-target.ts");
    const link = path.join(project, "App.tsx");
    await fs.symlink(missing, link);

    const written = await writeVerified(project, link, "pwned\n");
    assert.equal(written.ok, false);
    assert.equal(written.reason, PATH_OUTSIDE_PROJECT_ROOT);

    const created = await createProjectFile(project, link, "pwned\n");
    assert.equal(created.ok, false);
    assert.equal(created.reason, PATH_OUTSIDE_PROJECT_ROOT);

    await assert.rejects(fs.stat(missing), /ENOENT/);
    assert.equal(await readSentinel(sentinel), "untouched\n");
  });

  it("rejects recursive mkdir/write when the nearest existing ancestor is an outside-pointing symlink", async () => {
    const { project, outside, sentinel } = await makeProjectPair();
    const src = path.join(project, "src");
    await fs.symlink(outside, src);
    const dest = path.join(src, "nested", "deep", "App.tsx");

    const written = await writeVerified(project, dest, "pwned\n");
    assert.equal(written.ok, false);
    assert.equal(written.reason, PATH_OUTSIDE_PROJECT_ROOT);

    const created = await createProjectFile(project, dest, "pwned\n");
    assert.equal(created.ok, false);
    assert.equal(created.reason, PATH_OUTSIDE_PROJECT_ROOT);

    assert.equal(await readSentinel(sentinel), "untouched\n");
    await assert.rejects(fs.stat(path.join(outside, "nested")), /ENOENT/);
  });

  it("allows writes when the project root is opened through a symlink alias", async () => {
    const real = await mkdtemp(path.join(tmpdir(), "bl-alias-real-"));
    const holder = await mkdtemp(path.join(tmpdir(), "bl-alias-hold-"));
    const alias = path.join(holder, "project");
    await fs.symlink(real, alias);
    const dest = path.join(alias, "src", "App.tsx");
    const result = await createProjectFile(alias, dest, "export const ok = true;\n");
    assert.equal(result.ok, true);
    assert.equal(
      await fs.readFile(path.join(real, "src", "App.tsx"), "utf8"),
      "export const ok = true;\n",
    );
    assert.equal(isCanonicalPathWithinRoot(alias, dest), true);
    assert.equal(isCanonicalPathWithinRoot(alias, alias), true);
  });

  it("allows operations when a symlink resolves to another location inside the project", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-inside-link-"));
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "src", "App.tsx"), "old\n", "utf8");
    const link = path.join(root, "alias-App.tsx");
    await fs.symlink(path.join(root, "src", "App.tsx"), link);

    const written = await writeVerified(root, link, "new\n");
    assert.equal(written.ok, true);
    assert.equal(await fs.readFile(path.join(root, "src", "App.tsx"), "utf8"), "new\n");

    const edited = await applyEdit(root, link, "new\n", "newer\n");
    assert.equal(edited.ok, true);

    const innerDir = path.join(root, "src");
    const dirLink = path.join(root, "src-link");
    await fs.symlink(innerDir, dirLink);
    const nested = path.join(dirLink, "Extra.tsx");
    const created = await createProjectFile(root, nested, "export const extra = 1;\n");
    assert.equal(created.ok, true);
    assert.equal(
      await fs.readFile(path.join(root, "src", "Extra.tsx"), "utf8"),
      "export const extra = 1;\n",
    );
  });

  it("fails closed on unexpected realpath errors such as ELOOP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-eloop-"));
    const loop = path.join(root, "loop");
    await fs.symlink("loop", loop);
    const dest = path.join(loop, "file.ts");
    const written = await writeVerified(root, dest, "nope\n");
    assert.equal(written.ok, false);
    assert.equal(written.reason, PATH_OUTSIDE_PROJECT_ROOT);
    const created = await createProjectFile(root, dest, "nope\n");
    assert.equal(created.ok, false);
    const deleted = await deleteProjectFile(root, dest);
    assert.equal(deleted.ok, false);
  });

  it("fails closed when the project root cannot be canonicalized", () => {
    const missingRoot = path.join(tmpdir(), `bl-missing-root-${Date.now()}`);
    const result = validateWritePath(missingRoot, path.join(missingRoot, "a.ts"));
    assert.equal(result.ok, false);
    assert.equal(result.reason, PATH_OUTSIDE_PROJECT_ROOT);
    assert.equal(isCanonicalPathWithinRoot(missingRoot, path.join(missingRoot, "a.ts")), false);
  });
});
