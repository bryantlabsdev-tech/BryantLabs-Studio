import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_TSCONFIG_NODE_JSON } from "./configRepair.cjs";
import { writeGreenfieldFiles } from "./write.cjs";
import { GREENFIELD_PATHS, type GeneratedFile } from "./generate.cjs";

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
    ];

    const result = await writeGreenfieldFiles(root, files, { mode: "workspace" });

    assert.equal(result.ok, true);
    assert.equal(result.written.includes("src/pages/Dashboard.tsx"), true);
    assert.equal(result.written.includes("src/components/Layout.tsx"), true);

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
});
