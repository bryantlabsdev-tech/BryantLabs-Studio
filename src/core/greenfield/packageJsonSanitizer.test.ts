import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNpmEtargetFailure,
  parseEtargetPackage,
  removePackageFromPackageJson,
  sanitizePackageJsonContent,
} from "@/core/greenfield/packageJsonSanitizer";

const BASE_PKG = {
  name: "fieldflow",
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
    "react-router-dom": "^6.24.1",
  },
  devDependencies: {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/react-router-dom": "^6.24.1",
    "@vitejs/plugin-react": "^5.0.0",
    typescript: "^5.4.5",
    vite: "^5.3.1",
  },
};

describe("packageJsonSanitizer", () => {
  it("removes @types/react-router-dom when react-router-dom v6+ is present", () => {
    const result = sanitizePackageJsonContent(JSON.stringify(BASE_PKG, null, 2));
    assert.equal(result.changed, true);
    assert.ok(
      result.repairs.some((repair) => repair.includes("@types/react-router-dom")),
    );
    const parsed = JSON.parse(result.content) as {
      devDependencies: Record<string, string>;
    };
    assert.equal(parsed.devDependencies["@types/react-router-dom"], undefined);
    assert.equal(
      JSON.parse(result.content).dependencies["react-router-dom"],
      "^6.24.1",
    );
  });

  it("removes @types/vite when vite is present", () => {
    const pkg = {
      ...BASE_PKG,
      devDependencies: {
        ...BASE_PKG.devDependencies,
        "@types/vite": "^5.0.0",
      },
    };
    delete (pkg.devDependencies as Record<string, string>)["@types/react-router-dom"];
    const result = sanitizePackageJsonContent(JSON.stringify(pkg, null, 2));
    assert.equal(result.changed, true);
    assert.ok(result.repairs.some((repair) => repair.includes("@types/vite")));
  });

  it("parses ETARGET package from npm output", () => {
    const stderr = `npm error code ETARGET
npm error notarget No matching version found for @types/react-router-dom@^6.24.1.`;
    assert.equal(isNpmEtargetFailure("", stderr), true);
    assert.deepEqual(parseEtargetPackage("", stderr), {
      packageName: "@types/react-router-dom",
      version: "^6.24.1",
    });
  });

  it("removes unavailable package on ETARGET repair", () => {
    const result = removePackageFromPackageJson(
      JSON.stringify(BASE_PKG, null, 2),
      "@types/react-router-dom",
    );
    assert.equal(result.changed, true);
    const parsed = JSON.parse(result.content) as {
      devDependencies: Record<string, string>;
    };
    assert.equal(parsed.devDependencies["@types/react-router-dom"], undefined);
  });
});
