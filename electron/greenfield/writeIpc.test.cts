import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { handleGreenfieldWriteIpc } from "./writeIpc.cjs";
import { FOLDER_NOT_EMPTY_CODE } from "./folderPaths.cjs";
import { GREENFIELD_PATHS, type GeneratedFile } from "./generate.cjs";
import { cancelActiveProviderRequests } from "../providers/providerRequestRegistry.cjs";
import { deleteProjectFile, writeVerified } from "../fileWriter.cjs";
import type { GreenfieldWriteIo } from "./write.cjs";

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

function relFrom(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

describe("handleGreenfieldWriteIpc", () => {
  it("returns ok: false with empty written after cancelled write rollback", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-ipc-cancel-"));
    const previous = '{"name":"ipc-prior"}\n';
    await fs.writeFile(path.join(root, "package.json"), previous, "utf8");
    const generationId = "gf-ipc-cancel-write";
    let count = 0;
    const io: GreenfieldWriteIo = {
      writeVerified: async (projRoot, filePath, content) => {
        const result = await writeVerified(projRoot, filePath, content);
        if (result.ok) {
          count += 1;
          if (count >= 1) {
            cancelActiveProviderRequests("user_cancel", generationId);
          }
        }
        return result;
      },
      deleteProjectFile,
    };
    const result = await handleGreenfieldWriteIpc({
      approvedRoot: root,
      files: sampleFiles(),
      generationId,
      writeMode: "workspace",
      writeOptions: { io },
    });
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, []);
    assert.equal(await fs.readFile(path.join(root, "package.json"), "utf8"), previous);
    await assert.rejects(fs.access(path.join(root, "src/App.tsx")));
  });

  it("on incomplete rollback, written identifies paths still different from the snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-ipc-partial-"));
    const previous = '{"name":"ipc-stuck"}\n';
    await fs.writeFile(path.join(root, "package.json"), previous, "utf8");
    const io: GreenfieldWriteIo = {
      writeVerified: async (projRoot, filePath, content) => {
        const rel = relFrom(root, filePath);
        if (rel === "index.html") {
          return { ok: false, reason: "forced write failure" };
        }
        if (content === previous) {
          return { ok: false, reason: "restore blocked" };
        }
        return writeVerified(projRoot, filePath, content);
      },
      deleteProjectFile: async () => ({ ok: false, reason: "delete blocked" }),
    };
    const result = await handleGreenfieldWriteIpc({
      approvedRoot: root,
      files: sampleFiles(),
      writeMode: "workspace",
      writeOptions: { io },
    });
    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.equal(result.ok, false);
    assert.ok(result.written.includes("package.json"));
    assert.equal(result.written.includes("index.html"), false);
    assert.ok(result.errors.some((e) => /Remaining affected paths:/i.test(e)));
    const pkg = await fs.readFile(path.join(root, "package.json"), "utf8");
    assert.match(pkg, /test-app/);
  });

  it("preserves safe-mode empty-folder gating without writing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-gf-ipc-safe-"));
    await fs.writeFile(path.join(root, "notes.txt"), "user", "utf8");
    const result = await handleGreenfieldWriteIpc({
      approvedRoot: root,
      files: sampleFiles(),
      writeMode: "safe",
    });
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.equal(result.code, FOLDER_NOT_EMPTY_CODE);
    await assert.rejects(fs.access(path.join(root, "src/App.tsx")));
    assert.equal(await fs.readFile(path.join(root, "notes.txt"), "utf8"), "user");
  });
});
