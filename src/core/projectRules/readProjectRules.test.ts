import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleInstructionPackFromTrusted,
  getLastInstructionPackText,
  MAX_MDC_CANDIDATES,
} from "@/core/projectRules/instructionPack";
import {
  clearProjectRulesCache,
  loadProjectInstructionPack,
  readProjectRulesText,
} from "@/core/projectRules/readProjectRules";

describe("readProjectRules instruction pack", () => {
  it("prefers Studio rules before legacy .cursorrules and still includes both", async () => {
    clearProjectRulesCache();
    const pack = assembleInstructionPackFromTrusted({
      sources: [
        { relativePath: ".bryantlabs/rules.md", body: "STUDIO_RULES" },
        { relativePath: ".cursorrules", body: "LEGACY_CURSORRULES" },
      ],
      skipped: [],
    });
    assert.match(pack.text, /STUDIO_RULES/);
    assert.match(pack.text, /LEGACY_CURSORRULES/);
    assert.ok(pack.text.indexOf("STUDIO_RULES") < pack.text.indexOf("LEGACY_CURSORRULES"));
    assert.deepEqual(pack.diagnostic.loaded, [".bryantlabs/rules.md", ".cursorrules"]);
  });

  it("keeps former .cursorrules body when it is the only source, plus the source label", async () => {
    const text = assembleInstructionPackFromTrusted({
      sources: [{ relativePath: ".cursorrules", body: "Prefer functional components." }],
      skipped: [],
    }).text;
    assert.match(text, /Prefer functional components/);
    assert.match(text, /### Source: \.cursorrules/);
  });

  it("keeps former Studio rules body when it is the only source, plus the source label", () => {
    const text = assembleInstructionPackFromTrusted({
      sources: [{ relativePath: ".bryantlabs/rules.md", body: "Use the design tokens." }],
      skipped: [],
    }).text;
    assert.match(text, /Use the design tokens/);
    assert.match(text, /### Source: \.bryantlabs\/rules\.md/);
    assert.doesNotMatch(text, /AGENTS\.md/);
  });

  it("loads root AGENTS.md and lexical always-apply .mdc files", () => {
    const pack = assembleInstructionPackFromTrusted({
      sources: [
        { relativePath: "AGENTS.md", body: "MARKER_AGENTS" },
        { relativePath: ".cursor/rules/aaa.mdc", body: "---\nalwaysApply: true\n---\nMARKER_A" },
        { relativePath: ".cursor/rules/zzz.mdc", body: "---\nalwaysApply: true\n---\nMARKER_Z" },
        { relativePath: ".cursor/rules/skip.mdc", body: "---\nalwaysApply: false\n---\nMARKER_SKIP" },
      ],
      skipped: [],
    });
    assert.match(pack.text, /MARKER_AGENTS/);
    assert.match(pack.text, /MARKER_A/);
    assert.match(pack.text, /MARKER_Z/);
    assert.doesNotMatch(pack.text, /MARKER_SKIP/);
    assert.ok(pack.text.indexOf("MARKER_A") < pack.text.indexOf("MARKER_Z"));
    assert.ok(
      pack.diagnostic.skipped.some(
        (s) => s.path.endsWith("skip.mdc") && s.reason === "not_always_apply",
      ),
    );
  });

  it("deduplicates the same canonical relative path without dropping the higher-priority source", () => {
    const pack = assembleInstructionPackFromTrusted({
      sources: [
        { relativePath: "AGENTS.md", body: "ONCE" },
        { relativePath: "AGENTS.md", body: "SECOND" },
      ],
      skipped: [],
    });
    assert.equal(pack.diagnostic.loaded.filter((p) => p === "AGENTS.md").length, 1);
    assert.ok(pack.diagnostic.skipped.some((s) => s.reason === "duplicate"));
    assert.match(pack.text, /ONCE/);
    assert.doesNotMatch(pack.text, /SECOND/);
  });

  it("keeps AGENTS.md when a later alias is reported as a duplicate skip", () => {
    const pack = assembleInstructionPackFromTrusted({
      sources: [{ relativePath: "AGENTS.md", body: "ONCE" }],
      skipped: [{ path: ".cursorrules", reason: "duplicate" }],
    });
    assert.match(pack.text, /ONCE/);
    assert.deepEqual(pack.diagnostic.loaded, ["AGENTS.md"]);
    assert.ok(pack.diagnostic.skipped.some((s) => s.path === ".cursorrules" && s.reason === "duplicate"));
  });

  it("propagates symlink escape and non-regular skips without loading their bodies", () => {
    const pack = assembleInstructionPackFromTrusted({
      sources: [{ relativePath: "AGENTS.md", body: "OK" }],
      skipped: [
        { path: ".cursorrules", reason: "symlink_escape" },
        { path: ".cursor/rules/pipe.mdc", reason: "not_regular_file" },
      ],
    });
    assert.match(pack.text, /OK/);
    assert.doesNotMatch(pack.text, /OUTSIDE/);
    assert.ok(pack.diagnostic.skipped.some((s) => s.reason === "symlink_escape"));
    assert.ok(pack.diagnostic.skipped.some((s) => s.reason === "not_regular_file"));
    assert.ok(!JSON.stringify(pack.diagnostic).includes("/tmp"));
  });

  it("bounds always-apply .mdc candidates", () => {
    const sources = Array.from({ length: MAX_MDC_CANDIDATES + 8 }, (_, i) => ({
      relativePath: `.cursor/rules/${String(i).padStart(3, "0")}.mdc`,
      body: "---\nalwaysApply: true\n---\nX",
    }));
    const pack = assembleInstructionPackFromTrusted({ sources, skipped: [] });
    assert.equal(pack.diagnostic.loaded.length, MAX_MDC_CANDIDATES);
    assert.ok(pack.diagnostic.skipped.some((s) => s.reason === "candidate_limit"));
  });

  it("isolates last-pack memory by clear and does not reuse another root", async () => {
    clearProjectRulesCache();
    let body = "ONE";
    const api = {
      loadProjectInstructionPack: async () => ({
        sources: [{ relativePath: "AGENTS.md", body }],
        skipped: [],
      }),
    };
    const first = await loadProjectInstructionPack(api, "/tmp/a");
    body = "TWO";
    const second = await loadProjectInstructionPack(api, "/tmp/a");
    assert.match(first.text, /ONE/);
    assert.match(second.text, /TWO/);

    clearProjectRulesCache();
    assert.equal(getLastInstructionPackText(), "");

    const other = await loadProjectInstructionPack(
      {
        loadProjectInstructionPack: async () => ({
          sources: [{ relativePath: "AGENTS.md", body: "OTHER" }],
          skipped: [],
        }),
      },
      "/tmp/b",
    );
    assert.match(other.text, /OTHER/);
    assert.doesNotMatch(other.text, /TWO/);
  });

  it("does not treat a malformed IPC payload as instruction text", async () => {
    clearProjectRulesCache();
    const pack = await loadProjectInstructionPack({
      loadProjectInstructionPack: async () => ({ ok: true }) as never,
    });
    assert.equal(pack.text, "");
    assert.equal(pack.diagnostic.characterCount, 0);
  });

  it("readProjectRulesText returns assembled text from the trusted load", async () => {
    const text = await readProjectRulesText({
      loadProjectInstructionPack: async () => ({
        sources: [{ relativePath: "AGENTS.md", body: "local" }],
        skipped: [],
      }),
    });
    assert.match(text, /local/);
  });
});
