import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GREENFIELD_PACKAGE_VERSION_ERROR,
  GREENFIELD_VITE_ELECTRON_ERROR,
  GREENFIELD_CONFIG_REF_UNKNOWN_ERROR,
  validateGreenfieldFiles,
  validatePackageJsonContent,
  validatePackageJsonNoElectron,
  validateTsconfigContent,
  validateViteConfigContent,
} from "./validate.cjs";
import type { GeneratedFile } from "./generate.cjs";
import { GREENFIELD_PATHS } from "./paths.cjs";

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

function stubFiles(tsconfigContent: string, packageJson = VALID_PACKAGE_JSON): GeneratedFile[] {
  return GREENFIELD_PATHS.map((p) => ({
    path: p,
    content:
      p === "tsconfig.json"
        ? tsconfigContent
        : p === "package.json"
          ? packageJson
          : p === "vite.config.ts"
            ? PLAIN_VITE_CONFIG
            : `// ${p}`,
  })) as GeneratedFile[];
}

describe("validateTsconfigContent", () => {
  it("allows project references when the target file is present", () => {
    const err = validateTsconfigContent(
      JSON.stringify({
        compilerOptions: { strict: true, jsx: "react-jsx" },
        include: ["src"],
        references: [{ path: "./tsconfig.node.json" }],
      }),
      new Set(["tsconfig.node.json", "tsconfig.json"]),
    );
    assert.equal(err, null);
  });

  it("allows standalone tsconfig without references", () => {
    const err = validateTsconfigContent(
      JSON.stringify({
        compilerOptions: {
          strict: true,
          jsx: "react-jsx",
          noEmit: true,
        },
        include: ["src", "vite.config.ts"],
      }),
    );
    assert.equal(err, null);
  });

  it("rejects unknown extends when file is not present", () => {
    const err = validateTsconfigContent(
      JSON.stringify({
        extends: "./tsconfig.base.json",
        include: ["src"],
      }),
      new Set(["tsconfig.json"]),
    );
    assert.equal(err, GREENFIELD_CONFIG_REF_UNKNOWN_ERROR("tsconfig.base.json"));
  });
});

describe("validatePackageJsonContent", () => {
  it("rejects React RC versions", () => {
    const bad = JSON.parse(VALID_PACKAGE_JSON) as Record<string, unknown>;
    (bad.dependencies as Record<string, string>).react = "19.0.0-rc-0";
    assert.equal(
      validatePackageJsonContent(JSON.stringify(bad)),
      GREENFIELD_PACKAGE_VERSION_ERROR,
    );
  });

  it("rejects missing @types/react", () => {
    const bad = JSON.parse(VALID_PACKAGE_JSON) as Record<string, unknown>;
    delete (bad.devDependencies as Record<string, string>)["@types/react"];
    assert.equal(
      validatePackageJsonContent(JSON.stringify(bad)),
      GREENFIELD_PACKAGE_VERSION_ERROR,
    );
  });

  it("rejects react/react-dom major mismatch", () => {
    const bad = JSON.parse(VALID_PACKAGE_JSON) as Record<string, unknown>;
    (bad.dependencies as Record<string, string>)["react-dom"] = "^17.0.0";
    assert.equal(
      validatePackageJsonContent(JSON.stringify(bad)),
      GREENFIELD_PACKAGE_VERSION_ERROR,
    );
  });

  it("allows the pinned stable versions", () => {
    assert.equal(validatePackageJsonContent(VALID_PACKAGE_JSON), null);
  });
});

describe("validateViteConfigContent", () => {
  it("accepts plain Vite React config", () => {
    assert.equal(validateViteConfigContent(PLAIN_VITE_CONFIG), null);
  });

  it("rejects vite-plugin-electron", () => {
    const bad = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
export default defineConfig({ plugins: [react(), electron()] });`;
    assert.equal(validateViteConfigContent(bad), GREENFIELD_VITE_ELECTRON_ERROR);
  });

  it("rejects electron main/preload options", () => {
    const bad = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  main: "electron/main.ts",
  preload: "electron/preload.ts",
});`;
    assert.equal(validateViteConfigContent(bad), GREENFIELD_VITE_ELECTRON_ERROR);
  });
});

describe("validatePackageJsonNoElectron", () => {
  it("rejects vite-plugin-electron dependency", () => {
    const bad = JSON.parse(VALID_PACKAGE_JSON) as Record<string, unknown>;
    (bad.devDependencies as Record<string, string>)["vite-plugin-electron"] =
      "^0.28.0";
    assert.equal(
      validatePackageJsonNoElectron(JSON.stringify(bad)),
      GREENFIELD_VITE_ELECTRON_ERROR,
    );
  });
});

describe("validateGreenfieldFiles", () => {
  it("passes when tsconfig has no external references", () => {
    const result = validateGreenfieldFiles(
      stubFiles(
        JSON.stringify({
          compilerOptions: { jsx: "react-jsx", strict: true },
          include: ["src", "vite.config.ts"],
        }),
      ),
    );
    assert.equal(result.ok, true);
  });

  it("repairs missing tsconfig.node.json and passes validation", () => {
    const result = validateGreenfieldFiles(
      stubFiles(
        JSON.stringify({
          compilerOptions: { jsx: "react-jsx", strict: true, noEmit: true },
          include: ["src"],
          references: [{ path: "./tsconfig.node.json" }],
        }),
      ),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.repairs, ["tsconfig.node.json"]);
    assert.ok(result.files.some((f) => f.path === "tsconfig.node.json"));
  });

  it("rejects unknown config references", () => {
    const result = validateGreenfieldFiles(
      stubFiles(
        JSON.stringify({
          compilerOptions: { jsx: "react-jsx", strict: true },
          include: ["src"],
          extends: "./tsconfig.base.json",
        }),
      ),
    );
    assert.equal(result.ok, false);
    assert.equal(
      result.errors[0],
      GREENFIELD_CONFIG_REF_UNKNOWN_ERROR("tsconfig.base.json"),
    );
  });

  it("rejects contaminated vite.config.ts", () => {
    const files = stubFiles(
      JSON.stringify({
        compilerOptions: { jsx: "react-jsx", strict: true },
        include: ["src", "vite.config.ts"],
      }),
    ).map((f) =>
      f.path === "vite.config.ts"
        ? {
            path: f.path,
            content: `import electron from "vite-plugin-electron";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [electron()] });`,
          }
        : f,
    );
    const result = validateGreenfieldFiles(files);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0], GREENFIELD_VITE_ELECTRON_ERROR);
  });

  it("rejects package.json with RC versions", () => {
    const badPkg = JSON.parse(VALID_PACKAGE_JSON) as Record<string, unknown>;
    (badPkg.dependencies as Record<string, string>).react = "19.0.0-rc-0";
    (badPkg.devDependencies as Record<string, string>)["@types/react"] =
      "19.0.0-rc-0";
    const result = validateGreenfieldFiles(
      stubFiles(
        JSON.stringify({
          compilerOptions: { jsx: "react-jsx", strict: true },
          include: ["src", "vite.config.ts"],
        }),
        JSON.stringify(badPkg),
      ),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errors[0], GREENFIELD_PACKAGE_VERSION_ERROR);
  });
});
