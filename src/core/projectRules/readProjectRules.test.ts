import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearProjectRulesCache,
  readProjectRulesText,
} from "@/core/projectRules/readProjectRules";

describe("readProjectRules", () => {
  it("prefers .bryantlabs/rules.md over .cursorrules", async () => {
    clearProjectRulesCache();
    const api = {
      readFile: async (abs: string) => {
        if (abs.endsWith(".bryantlabs/rules.md")) {
          return { readable: true, content: "# Studio rules\nUse TypeScript strict mode." };
        }
        if (abs.endsWith(".cursorrules")) {
          return { readable: true, content: "legacy cursor rules" };
        }
        return { readable: false };
      },
    };

    const text = await readProjectRulesText(api as never, "/tmp/app");
    assert.equal(text, "# Studio rules\nUse TypeScript strict mode.");
  });

  it("falls back to .cursorrules when rules.md is missing", async () => {
    clearProjectRulesCache();
    const api = {
      readFile: async (abs: string) => {
        if (abs.endsWith(".cursorrules")) {
          return { readable: true, content: "Prefer functional components." };
        }
        return { readable: false };
      },
    };

    const text = await readProjectRulesText(api as never, "/tmp/app");
    assert.equal(text, "Prefer functional components.");
  });

  it("caches rules per project root", async () => {
    clearProjectRulesCache();
    let reads = 0;
    const api = {
      readFile: async () => {
        reads += 1;
        return { readable: true, content: "cached" };
      },
    };

    await readProjectRulesText(api as never, "/tmp/cache");
    await readProjectRulesText(api as never, "/tmp/cache");
    assert.equal(reads, 1);
  });
});
