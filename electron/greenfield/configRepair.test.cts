import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TSCONFIG_NODE_JSON,
  GREENFIELD_CONFIG_REF_UNKNOWN_ERROR,
  prepareGreenfieldFiles,
  repairGreenfieldConfigReferences,
} from "./configRepair.cjs";
import type { GeneratedFile } from "./generate.cjs";
import { GREENFIELD_PATHS } from "./paths.cjs";
import { validateGreenfieldFiles } from "./validate.cjs";

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

function stubFiles(tsconfigContent: string): GeneratedFile[] {
  return GREENFIELD_PATHS.map((p) => ({
    path: p,
    content:
      p === "tsconfig.json"
        ? tsconfigContent
        : p === "package.json"
          ? VALID_PACKAGE_JSON
          : p === "vite.config.ts"
            ? PLAIN_VITE_CONFIG
            : p === "src/main.tsx"
              ? `import App from "./App";\nimport "./index.css";\n`
              : p === "src/App.tsx"
                ? `export default function App() { return null; }\n`
                : `// ${p}`,
  })) as GeneratedFile[];
}

describe("repairGreenfieldConfigReferences", () => {
  it("auto-creates tsconfig.node.json when referenced", () => {
    const files = stubFiles(
      JSON.stringify({
        compilerOptions: { strict: true, jsx: "react-jsx" },
        include: ["src"],
        references: [{ path: "./tsconfig.node.json" }],
      }),
    );
    const repaired = repairGreenfieldConfigReferences(files);
    assert.equal(repaired.errors.length, 0);
    assert.deepEqual(repaired.repairs, ["tsconfig.node.json"]);
    const node = repaired.files.find((f) => f.path === "tsconfig.node.json");
    assert.ok(node);
    assert.equal(node?.content.trim(), DEFAULT_TSCONFIG_NODE_JSON.trim());
  });

  it("fails unknown missing references with a clear error", () => {
    const files = stubFiles(
      JSON.stringify({
        extends: "./tsconfig.base.json",
        include: ["src"],
      }),
    );
    const repaired = repairGreenfieldConfigReferences(files);
    assert.equal(repaired.repairs.length, 0);
    assert.equal(
      repaired.errors[0],
      GREENFIELD_CONFIG_REF_UNKNOWN_ERROR("tsconfig.base.json"),
    );
  });
});

describe("prepareGreenfieldFiles", () => {
  it("validates repaired tsconfig references and passes greenfield validation", () => {
    const prepared = prepareGreenfieldFiles(
      stubFiles(
        JSON.stringify({
          compilerOptions: { strict: true, jsx: "react-jsx", noEmit: true },
          include: ["src"],
          references: [{ path: "./tsconfig.node.json" }],
        }),
      ),
    );
    assert.equal(prepared.ok, true);
    assert.deepEqual(prepared.repairs, ["tsconfig.node.json"]);

    const validated = validateGreenfieldFiles(prepared.files, { skipRepair: true });
    assert.equal(validated.ok, true);
    const pkg = validated.files.find((f) => f.path === "package.json");
    assert.ok(pkg);
    const parsed = JSON.parse(pkg!.content) as { scripts: { build: string; typecheck: string } };
    assert.match(parsed.scripts.build, /tsc/);
    assert.match(parsed.scripts.typecheck, /tsc/);
  });
});
