import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  isNpmEtargetFailure,
  parseEtargetPackage,
  repairPackageJsonOnDiskForEtarget,
  sanitizePackageJsonContent,
  sanitizePackageJsonOnDisk,
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

  it("cannot write through an outside-pointing package.json file symlink", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bl-pkg-proj-"));
    const outside = await mkdtemp(path.join(tmpdir(), "bl-pkg-out-"));
    const original = `${JSON.stringify({
      dependencies: {
        react: "^18.3.1",
        "react-router-dom": "^6.24.1",
      },
      devDependencies: {
        "@types/react-router-dom": "^6.24.1",
      },
    }, null, 2)}\n`;
    const outsidePkg = path.join(outside, "package.json");
    await fs.writeFile(outsidePkg, original, "utf8");
    await fs.symlink(outsidePkg, path.join(project, "package.json"));

    const sanitized = await sanitizePackageJsonOnDisk(project);
    assert.equal(sanitized.changed, false);
    assert.equal(await fs.readFile(outsidePkg, "utf8"), original);

    const repaired = await repairPackageJsonOnDiskForEtarget(
      project,
      "@types/react-router-dom",
    );
    assert.equal(repaired.changed, false);
    assert.equal(await fs.readFile(outsidePkg, "utf8"), original);
  });
});
