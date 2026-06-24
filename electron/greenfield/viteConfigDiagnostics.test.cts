import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  buildViteConfigDiagnostics,
  discoverConfigImports,
  findMissingConfigImports,
  formatViteConfigRootCause,
  parseViteConfigException,
} from "./viteConfigDiagnostics.cjs";

describe("parseViteConfigException", () => {
  it("parses missing package with line from config", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vite-diag-"));
    const configPath = path.join(tmp, "vite.config.ts");
    fs.writeFileSync(
      configPath,
      `import motion from 'framer-motion';\nimport { defineConfig } from 'vite';\nexport default defineConfig({});\n`,
    );
    const stderr = [
      "failed to load config from vite.config.ts",
      "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'framer-motion' imported from " +
        configPath,
      "    at packageResolve (node:internal/modules/esm/resolve:873:9)",
    ].join("\n");

    const parsed = parseViteConfigException(stderr, tmp, configPath);
    assert.ok(parsed);
    assert.equal(parsed?.missingPackage, "framer-motion");
    const root = formatViteConfigRootCause(parsed!, "vite.config.ts");
    assert.match(root, /vite\.config\.ts:1/);
    assert.match(root, /Cannot find package 'framer-motion'/);
  });

  it("parses SyntaxError", () => {
    const stderr = [
      "failed to load config from vite.config.ts",
      "SyntaxError: Unexpected token 'export'",
      "    at compileSourceTextModule (node:internal/modules/esm/utils:346:16)",
    ].join("\n");
    const parsed = parseViteConfigException(stderr, "/proj", "/proj/vite.config.ts");
    assert.ok(parsed?.syntaxError);
    const root = formatViteConfigRootCause(parsed!, "vite.config.ts");
    assert.match(root, /SyntaxError/);
  });

  it("parses esbuild could not resolve with line", () => {
    const stderr = [
      "failed to load config from vite.config.ts",
      "Error: Build failed with 1 error:",
      "vite.config.ts:7:24: ERROR: Could not resolve \"framer-motion\"",
    ].join("\n");
    const parsed = parseViteConfigException(
      stderr,
      "/proj",
      "/proj/vite.config.ts",
    );
    assert.equal(parsed?.line, 7);
    assert.equal(parsed?.missingPackage, "framer-motion");
    const root = formatViteConfigRootCause(parsed!, "vite.config.ts");
    assert.match(root, /vite\.config\.ts:7/);
    assert.match(root, /framer-motion/);
  });

  it("parses missing relative import", () => {
    const stderr = [
      "failed to load config from vite.config.ts",
      "Error [ERR_MODULE_NOT_FOUND]: Cannot find module './plugins/foo.ts'",
    ].join("\n");
    const parsed = parseViteConfigException(stderr, "/proj", "/proj/vite.config.ts");
    assert.equal(parsed?.missingRelative, "./plugins/foo.ts");
    const root = formatViteConfigRootCause(parsed!, "vite.config.ts");
    assert.match(root, /imports \.\/plugins\/foo\.ts which does not exist/);
  });
});

describe("buildViteConfigDiagnostics", () => {
  it("does not stop at wrapper line only", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vite-diag-"));
    const configPath = path.join(tmp, "vite.config.ts");
    fs.writeFileSync(
      configPath,
      `import x from 'missing-pkg-xyz-123';\nexport default {};\n`,
    );
    const stderr = [
      `failed to load config from ${configPath}`,
      "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'missing-pkg-xyz-123'",
    ].join("\n");

    const diag = buildViteConfigDiagnostics({ stdout: "", stderr, cwd: tmp });
    assert.ok(diag);
    assert.ok(!diag!.rootCauseLine.includes("failed to load config from"));
    assert.match(diag!.rootCauseLine, /missing-pkg-xyz-123/);
    assert.ok(diag!.fullOutput.includes(stderr));
    assert.ok(diag!.importsDiscovered.includes("missing-pkg-xyz-123"));
  });
});

describe("discoverConfigImports", () => {
  it("finds static and dynamic imports", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vite-diag-"));
    const configPath = path.join(tmp, "vite.config.ts");
    fs.writeFileSync(
      configPath,
      `import a from 'vite';\nconst b = () => import('./local.js');\n`,
    );
    const imports = discoverConfigImports(configPath);
    assert.ok(imports.includes("vite"));
    assert.ok(imports.includes("./local.js"));
  });
});

describe("findMissingConfigImports", () => {
  it("flags missing relative file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vite-diag-"));
    const configPath = path.join(tmp, "vite.config.ts");
    fs.writeFileSync(configPath, `import './nope.ts';\n`);
    const missing = findMissingConfigImports(tmp, configPath, ["./nope.ts"]);
    assert.deepEqual(missing, ["./nope.ts"]);
  });
});
