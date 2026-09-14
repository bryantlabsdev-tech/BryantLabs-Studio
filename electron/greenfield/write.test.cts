import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_TSCONFIG_NODE_JSON } from "./configRepair.cjs";
import {
  writeGreenfieldFiles,
  type GreenfieldWriteIo,
} from "./write.cjs";
import { GREENFIELD_PATHS, type GeneratedFile } from "./generate.cjs";
import { cancelActiveProviderRequests } from "../providers/providerRequestRegistry.cjs";
import { deleteProjectFile, writeVerified } from "../fileWriter.cjs";

const VALID_PACKAGE_JSON = JSON.stringify({
  name: "test-app",
  private: true,
  version: "0.0.0",
  type: "module",
  scripts: {
    dev: "vite",
    build: "tsc -p tsconfig.json && vite build",
    typecheck: "tsc -p tsconfig.json --noEmit",
    preview: "vite preview",
  },
  dependencies: {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  },
  devDependencies: {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^5.0.0",
    typescript: "^5.4.5",
    vite: "^5.3.1",
  },
});

const PLAIN_VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});`;

function relFrom(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

function ioCancelAfterSuccessfulWrites(
  generationId: string,
  count: number,
): GreenfieldWriteIo {
  let written = 0;
  return {
    writeVerified: async (root, filePath, content) => {
      const result = await writeVerified(root, filePath, content);
      if (result.ok) {
        written += 1;
        if (written >= count) {
          cancelActiveProviderRequests("user_cancel", generationId);
        }
      }
      return result;
    },
    deleteProjectFile,
  };
}

function ioFailOnRelPath(rootDir: string, targetRel: string): GreenfieldWriteIo {
  return {
    writeVerified: async (root, filePath, content) => {
      if (relFrom(rootDir, filePath) === targetRel) {
        return { ok: false, reason: "forced write failure" };
      }
      return writeVerified(root, filePath, content);
    },
    deleteProjectFile,
  };
}

function sampleFiles(): GeneratedFile[] {
  return GREENFIELD_PATHS.map((p) => ({
    path: p,
    content:
      p === "package.json"
        ? VALID_PACKAGE_JSON
        : p === "vite.config.ts"
          ? PLAIN_VITE_CONFIG
          : p === "tsconfig.json"
            ? JSON.stringify({
                compilerOptions: { strict: true, jsx: "react-jsx", noEmit: true },
                include: ["src", "vite.config.ts"],
              })
            : `// ${p}`,
  })) as GeneratedFile[];
}

describe("writeGreenfieldFiles", () => {
  it("repairs missing tsconfig.node.json and writes supplementary config", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-repair-"));
    const files = sampleFiles().map((f) =>
      f.path === "tsconfig.json"
        ? {
            path: f.path,
            content: JSON.stringify({
              compilerOptions: { strict: true, jsx: "react-jsx", noEmit: true },
              include: ["src"],
              references: [{ path: "./tsconfig.node.json" }],
            }),
          }
        : f,
    ) as GeneratedFile[];

    const result = await writeGreenfieldFiles(root, files, { mode: "workspace" });
    assert.equal(result.ok, true);
    assert.equal(result.written.includes("tsconfig.node.json"), true);
    assert.equal(result.written.length, GREENFIELD_PATHS.length + 1);

    const nodeConfig = await fs.readFile(path.join(root, "tsconfig.node.json"), "utf8");
    assert.equal(nodeConfig.trim(), DEFAULT_TSCONFIG_NODE_JSON.trim());
    const pkg = await fs.readFile(path.join(root, "package.json"), "utf8");
    assert.match(pkg, /tsc -p tsconfig.json/);
  });

  it("overwrites existing files in workspace mode", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-write-"));
    await fs.writeFile(path.join(root, "existing.txt"), "keep", "utf8");
    await fs.writeFile(path.join(root, "package.json"), '{"name":"old"}\n', "utf8");

    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
    });

    assert.equal(result.ok, true);
    assert.equal(result.written.length, GREENFIELD_PATHS.length);
    const pkg = await fs.readFile(path.join(root, "package.json"), "utf8");
    assert.match(pkg, /test-app/);
    const overwriteLog = result.logs.find((l) => l.path === "package.json");
    assert.equal(overwriteLog?.overwrite, true);
    assert.equal(overwriteLog?.ok, true);
    const kept = await fs.readFile(path.join(root, "existing.txt"), "utf8");
    assert.equal(kept, "keep");
  });

  it("rejects existing files in safe mode", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-safe-"));
    await fs.writeFile(path.join(root, "package.json"), '{"name":"old"}\n', "utf8");

    const result = await writeGreenfieldFiles(root, sampleFiles(), { mode: "safe" });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /already exists/i.test(e)));
    const pkgLog = result.logs.find((l) => l.path === "package.json");
    assert.equal(pkgLog?.overwrite, true);
    assert.equal(pkgLog?.ok, false);
  });

  it("creates missing directories automatically", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-mkdir-"));
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
    });
    assert.equal(result.ok, true);
    const srcLog = result.logs.find((l) => l.path === "src/main.tsx");
    assert.equal(srcLog?.mkdir, "created");
    assert.equal(srcLog?.ok, true);
  });

  it("writes nested multi-phase project files under src/pages and src/components", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-multiphase-"));
    const files = [
      ...sampleFiles(),
      {
        path: "src/pages/Dashboard.tsx",
        content: "export default function Dashboard() { return <div>Dash</div>; }",
      },
      {
        path: "src/components/Layout.tsx",
        content: "export default function Layout() { return <div />; }",
      },
      {
        path: "src/hooks/useJobs.ts",
        content: "export function useJobs() { return []; }",
      },
    ];

    const result = await writeGreenfieldFiles(root, files, { mode: "workspace" });

    assert.equal(result.ok, true);
    assert.equal(result.written.includes("src/pages/Dashboard.tsx"), true);
    assert.equal(result.written.includes("src/components/Layout.tsx"), true);
    assert.equal(result.written.includes("src/hooks/useJobs.ts"), true);

    const dashboard = await fs.readFile(
      path.join(root, "src/pages/Dashboard.tsx"),
      "utf8",
    );
    assert.match(dashboard, /Dashboard/);
    const layout = await fs.readFile(
      path.join(root, "src/components/Layout.tsx"),
      "utf8",
    );
    assert.match(layout, /Layout/);

    const pagesLog = result.logs.find((l) => l.path === "src/pages/Dashboard.tsx");
    assert.equal(pagesLog?.mkdir, "created");
    assert.equal(pagesLog?.ok, true);
  });

  it("writes public assets into nested public/", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-public-"));
    const files = [
      ...sampleFiles(),
      { path: "public/logo.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'/>" },
    ];
    const result = await writeGreenfieldFiles(root, files, { mode: "workspace" });
    assert.equal(result.ok, true);
    assert.equal(result.written.includes("public/logo.svg"), true);
    const logo = await fs.readFile(path.join(root, "public/logo.svg"), "utf8");
    assert.match(logo, /svg/);
  });

  it("rejects disallowed path traversal like ../evil.ts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-traversal-"));
    const files = [
      ...sampleFiles(),
      { path: "../evil.ts", content: "export const evil = true;" },
    ];

    const result = await writeGreenfieldFiles(root, files, { mode: "workspace" });

    assert.equal(result.ok, false);
    assert.equal(result.written.includes("../evil.ts"), false);
    assert.ok(result.errors.some((e) => /Rejected non-allowed path/i.test(e)));
    const evilInRoot = path.join(root, "evil.ts");
    await assert.rejects(fs.access(evilInRoot));
  });

  it("does not write files after the generation scope is cancelled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-cancel-write-"));
    cancelActiveProviderRequests("user_cancel", "gf-write-stop");
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
      generationId: "gf-write-stop",
    });
    assert.equal(result.ok, false);
    assert.equal(result.written.length, 0);
    await assert.rejects(fs.access(path.join(root, "package.json")));
    await assert.rejects(fs.access(path.join(root, "src/App.tsx")));
  });

  it("cancelling after the first successful creation removes that file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-cancel-create-"));
    const generationId = "gf-cancel-after-create";
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
      generationId,
      io: ioCancelAfterSuccessfulWrites(generationId, 1),
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, []);
    assert.ok(result.errors.some((e) => /cancelled by user/i.test(e)));
    assert.ok(result.errors.some((e) => /Rolled back 1 file/i.test(e)));
    await assert.rejects(fs.access(path.join(root, "package.json")));
  });

  it("cancelling after overwriting a file restores its exact prior contents", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-cancel-overwrite-"));
    const previous = '{"name":"exact-prior"}\n';
    await fs.writeFile(path.join(root, "package.json"), previous, "utf8");
    const generationId = "gf-cancel-after-overwrite";
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
      generationId,
      io: ioCancelAfterSuccessfulWrites(generationId, 1),
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, []);
    const restored = await fs.readFile(path.join(root, "package.json"), "utf8");
    assert.equal(restored, previous);
    await assert.rejects(fs.access(path.join(root, "src/App.tsx")));
  });

  it("a later forced write failure restores package.json and deletes created src files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-fail-later-"));
    const previous = '{"name":"keep-pkg"}\n';
    await fs.writeFile(path.join(root, "package.json"), previous, "utf8");
    await fs.writeFile(path.join(root, "unrelated.txt"), "leave-me", "utf8");
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
      io: ioFailOnRelPath(root, "src/App.tsx"),
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, []);
    assert.ok(result.errors.some((e) => /forced write failure/i.test(e)));
    const pkg = await fs.readFile(path.join(root, "package.json"), "utf8");
    assert.equal(pkg, previous);
    await assert.rejects(fs.access(path.join(root, "src/main.tsx")));
    await assert.rejects(fs.access(path.join(root, "src/index.css")));
    await assert.rejects(fs.access(path.join(root, "src/App.tsx")));
    const unrelated = await fs.readFile(path.join(root, "unrelated.txt"), "utf8");
    assert.equal(unrelated, "leave-me");
  });

  it("safe-mode failure after an earlier successful write removes the earlier creation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-safe-rollback-"));
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src/App.tsx"), "// existing app\n", "utf8");
    const result = await writeGreenfieldFiles(root, sampleFiles(), { mode: "safe" });
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, []);
    assert.ok(result.errors.some((e) => /already exists/i.test(e)));
    await assert.rejects(fs.access(path.join(root, "package.json")));
    await assert.rejects(fs.access(path.join(root, "src/main.tsx")));
    const app = await fs.readFile(path.join(root, "src/App.tsx"), "utf8");
    assert.equal(app, "// existing app\n");
  });

  it("mixed overwrite/create rollback runs in reverse and restores the snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-mixed-rollback-"));
    const oldPkg = '{"name":"snapshot-pkg"}\n';
    await fs.writeFile(path.join(root, "package.json"), oldPkg, "utf8");
    await fs.writeFile(path.join(root, "keep.txt"), "untouched", "utf8");
    const ops: string[] = [];
    const io: GreenfieldWriteIo = {
      writeVerified: async (projRoot, filePath, content) => {
        const rel = relFrom(root, filePath);
        if (rel === "vite.config.ts") {
          return { ok: false, reason: "forced write failure" };
        }
        const result = await writeVerified(projRoot, filePath, content);
        if (rel === "package.json" && content === oldPkg) {
          ops.push(`restore:${rel}`);
        }
        return result;
      },
      deleteProjectFile: async (projRoot, filePath) => {
        ops.push(`delete:${relFrom(root, filePath)}`);
        return deleteProjectFile(projRoot, filePath);
      },
    };
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
      io,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, []);
    assert.deepEqual(ops, [
      "delete:tsconfig.json",
      "delete:src/main.tsx",
      "delete:index.html",
      "restore:package.json",
    ]);
    assert.equal(await fs.readFile(path.join(root, "package.json"), "utf8"), oldPkg);
    assert.equal(await fs.readFile(path.join(root, "keep.txt"), "utf8"), "untouched");
    await assert.rejects(fs.access(path.join(root, "index.html")));
    await assert.rejects(fs.access(path.join(root, "tsconfig.json")));
    await assert.rejects(fs.access(path.join(root, "src/main.tsx")));
  });

  it("rollback failure reports remaining affected paths and does not claim an empty write set", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-rollback-fail-"));
    const oldPkg = '{"name":"cannot-restore"}\n';
    await fs.writeFile(path.join(root, "package.json"), oldPkg, "utf8");
    let forwardWrites = 0;
    const io: GreenfieldWriteIo = {
      writeVerified: async (projRoot, filePath, content) => {
        if (forwardWrites < 2) {
          const result = await writeVerified(projRoot, filePath, content);
          if (result.ok) forwardWrites += 1;
          return result;
        }
        return { ok: false, reason: "restore blocked" };
      },
      deleteProjectFile: async () => ({ ok: false, reason: "delete blocked" }),
    };
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
      io: {
        writeVerified: async (projRoot, filePath, content) => {
          const rel = relFrom(root, filePath);
          if (rel === "src/main.tsx") {
            return { ok: false, reason: "forced write failure" };
          }
          return io.writeVerified(projRoot, filePath, content);
        },
        deleteProjectFile: io.deleteProjectFile,
      },
    });
    assert.equal(result.ok, false);
    assert.ok(result.written.length > 0);
    assert.ok(result.written.includes("package.json"));
    assert.ok(result.written.includes("index.html"));
    assert.ok(result.errors.some((e) => /rollback failed: /i.test(e)));
    assert.ok(result.errors.some((e) => /Remaining affected paths:/i.test(e)));
    const pkg = await fs.readFile(path.join(root, "package.json"), "utf8");
    assert.match(pkg, /test-app/);
    await fs.access(path.join(root, "index.html"));
  });

  it("rejects nested write through src symlink without touching the outside sentinel", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-src-link-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-src-out-"));
    const sentinel = path.join(outside, "SENTINEL.txt");
    await fs.writeFile(sentinel, "untouched\n", "utf8");
    await fs.symlink(outside, path.join(root, "src"));

    const result = await writeGreenfieldFiles(root, sampleFiles(), { mode: "workspace" });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /Path is outside the project root/.test(e)));
    assert.equal(await fs.readFile(sentinel, "utf8"), "untouched\n");
    await assert.rejects(fs.access(path.join(outside, "App.tsx")));
    await assert.rejects(fs.access(path.join(outside, "main.tsx")));
    await assert.rejects(fs.access(path.join(outside, "index.css")));
  });

  it("rollback cannot restore or delete through an outside-pointing parent symlink", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-rb-link-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-rb-out-"));
    const sentinel = path.join(outside, "SENTINEL.txt");
    await fs.writeFile(sentinel, "untouched\n", "utf8");
    await fs.writeFile(path.join(outside, "main.tsx"), "outside-main\n", "utf8");
    let swapped = false;
    const io: GreenfieldWriteIo = {
      writeVerified: async (projRoot, filePath, content) => {
        const rel = relFrom(root, filePath);
        if (rel === "tsconfig.json" && !swapped) {
          swapped = true;
          await fs.rename(path.join(root, "src"), path.join(root, "src-real"));
          await fs.symlink(outside, path.join(root, "src"));
          return { ok: false, reason: "forced write failure" };
        }
        return writeVerified(projRoot, filePath, content);
      },
      deleteProjectFile,
    };
    const result = await writeGreenfieldFiles(root, sampleFiles(), {
      mode: "workspace",
      io,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => /Path is outside the project root|rollback failed/i.test(e)),
    );
    assert.equal(await fs.readFile(sentinel, "utf8"), "untouched\n");
    assert.equal(await fs.readFile(path.join(outside, "main.tsx"), "utf8"), "outside-main\n");
  });

  it("does not call clearDirectoryContents", async () => {
    const writeSrc = await fs.readFile(path.join(__dirname, "write.cjs"), "utf8");
    const ipcSrc = await fs.readFile(path.join(__dirname, "writeIpc.cjs"), "utf8");
    assert.equal(writeSrc.includes("clearDirectoryContents"), false);
    assert.equal(ipcSrc.includes("clearDirectoryContents"), false);
  });
});
