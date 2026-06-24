import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isNpmEtargetFailure,
  parseEtargetPackage,
  sanitizePackageJsonContent,
} from "./packageJsonSanitizer.cjs";

describe("electron packageJsonSanitizer", () => {
  it("removes obsolete react-router-dom types before install", () => {
    const pkg = JSON.stringify({
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "react-router-dom": "^6.24.1",
      },
      devDependencies: {
        "@types/react-router-dom": "^6.24.1",
      },
    });
    const result = sanitizePackageJsonContent(pkg);
    assert.equal(result.changed, true);
    const parsed = JSON.parse(result.content) as {
      devDependencies?: Record<string, string>;
    };
    assert.equal(parsed.devDependencies?.["@types/react-router-dom"], undefined);
  });

  it("detects ETARGET failures", () => {
    const stderr =
      "npm ERR! code ETARGET\nnpm ERR! notarget No matching version found for @types/react-router-dom@^6.24.1.";
    assert.equal(isNpmEtargetFailure("", stderr), true);
    assert.equal(parseEtargetPackage("", stderr)?.packageName, "@types/react-router-dom");
  });
});
