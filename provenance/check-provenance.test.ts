import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  INITIAL_IMPORT_COMMIT,
  parseEvidenceReference,
  parseInventoryRecords,
  parseProvenanceRegister,
  pathInEntireTreeScope,
  posixPrefixMatch,
  projectRootFrom,
  verifyFromDisk,
  verifyProvenance,
} from "../scripts/check-provenance.mjs";

const APP_MATERIAL = "Application source first imported in commit `bf3396e`";
const FIXTURE_MATERIAL = "Legacy benchmark fixtures included in the initial import";
const LOGO_MATERIAL = "BryantLabs logo source and generated icons";
const POST_MATERIAL = "Changes after the initial import";
const NPM_MATERIAL = "npm dependencies";

const LIVE_REGISTER = `| Material | Repository evidence | Status | Required |
| --- | --- | --- | --- |
| ${APP_MATERIAL} | recovered | **Unverified** | attest |
| ${FIXTURE_MATERIAL} | none | **Unverified** | attest |
| ${LOGO_MATERIAL} | commit | **Unverified** | attest |
| ${POST_MATERIAL} | git log | **Partially documented** | review |
| ${NPM_MATERIAL} | lockfile | **Machine checked, not legally cleared** | notices |
`;

function fields(overrides = {}) {
  return {
    id: "initial-application-source",
    material: APP_MATERIAL,
    status: "unresolved",
    introducing_commit: INITIAL_IMPORT_COMMIT,
    git_author: "A <a@b.c>",
    git_committer: "A <a@b.c>",
    author_date: "2026-06-24T00:38:44-04:00",
    committer_date: "2026-06-24T00:38:44-04:00",
    generated_or_authored: "unknown",
    copyright_ownership: "unknown",
    dependency_licensing: "not_applicable",
    trademark_clearance: "not_applicable",
    evidence_reference: "none",
    scope_kind: "path_list",
    informational: "false",
    missing_evidence: "pre-import history",
    ...overrides,
  };
}

function block(overrides = {}, paths = ["src/"], exclusions = []) {
  const merged = fields(overrides);
  const lines = Object.entries(merged).map(([k, v]) => `${k}: ${v}`);
  const pathLines = paths.map((p) => `- ${p}`).join("\n");
  const exLines = exclusions.map((p) => `- ${p}`).join("\n");
  return `\`\`\`provenance-record\n${lines.join("\n")}\npaths:\n${pathLines}\nexclusions:\n${exLines}\n\`\`\`\n`;
}

function fullInventory(extraBlocks = "") {
  return [
    block({ id: "initial-application-source", material: APP_MATERIAL }),
    block({ id: "legacy-benchmark-fixtures", material: FIXTURE_MATERIAL }, ["benchmarks/fixtures/"]),
    block(
      {
        id: "bryantlabs-logo-and-branding",
        material: LOGO_MATERIAL,
        introducing_commit: "04a13e98175ed2e32f8706b8b809683a6e2aef62",
      },
      ["assets/branding/"],
    ),
    block({ id: "post-import-changes", material: POST_MATERIAL, introducing_commit: "not_a_single_commit" }, [
      "commits after import",
    ]),
    block({ id: "npm-dependencies", material: NPM_MATERIAL }, ["package.json", "package-lock.json"]),
    extraBlocks,
  ].join("\n");
}

const STRUCTURED_EVIDENCE =
  "evidence_id=ATT-2026-09-16-001; record_type=owner_attestation; date=2026-09-16; reviewer=Jane Owner; stored_location=file:///evidence/attestation.pdf";

describe("evidence_reference format", () => {
  it("accepts none and rejects a random non-empty string", () => {
    assert.equal(parseEvidenceReference("none").ok, true);
    assert.equal(parseEvidenceReference("not-a-real-citation").ok, false);
    assert.equal(parseEvidenceReference("verified-by-git").ok, false);
  });

  it("accepts a structured citation with location or sha256", () => {
    assert.equal(parseEvidenceReference(STRUCTURED_EVIDENCE).ok, true);
    const hashed = parseEvidenceReference(
      "evidence_id=ATT-1; record_type=replacement_record; date=2026-01-02; reviewer=Pat Lee; content_sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert.equal(hashed.ok, true);
  });
});

describe("provenance checker", () => {
  it("accepts a complete register with unresolved inventory", () => {
    const result = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: fullInventory(),
    });
    assert.equal(result.ok, true, result.failures.join("; "));
    assert.equal(result.unverifiedCount, 3);
    assert.equal(result.registerCount, 5);
  });

  it("fails when a register row has no inventory record", () => {
    const result = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: block(),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /no inventory record/);
  });

  it("fails when a register row is Verified without structured evidence", () => {
    const register = LIVE_REGISTER.replace(
      `| ${APP_MATERIAL} | recovered | **Unverified** | attest |`,
      `| ${APP_MATERIAL} | recovered | **Verified** | attest |`,
    );
    const result = verifyProvenance({
      registerMarkdown: register,
      inventoryMarkdown: fullInventory(),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /Verified requires inventory status verified/);
  });

  it("fails when inventory is verified but the register is not", () => {
    const inventory = [
      block({
        id: "initial-application-source",
        material: APP_MATERIAL,
        status: "verified",
        evidence_reference: STRUCTURED_EVIDENCE,
      }),
      block({ id: "legacy-benchmark-fixtures", material: FIXTURE_MATERIAL }, ["benchmarks/fixtures/"]),
      block(
        {
          id: "bryantlabs-logo-and-branding",
          material: LOGO_MATERIAL,
          introducing_commit: "04a13e98175ed2e32f8706b8b809683a6e2aef62",
        },
        ["assets/branding/"],
      ),
      block({ id: "post-import-changes", material: POST_MATERIAL, introducing_commit: "not_a_single_commit" }, [
        "commits after import",
      ]),
      block({ id: "npm-dependencies", material: NPM_MATERIAL }, ["package.json", "package-lock.json"]),
    ].join("\n");
    const result = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: inventory,
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /verified but PROVENANCE.md row is not Verified/);
  });

  it("fails an unknown register status", () => {
    const register = LIVE_REGISTER.replace("**Unverified**", "**ClearedByVibes**");
    const result = verifyProvenance({
      registerMarkdown: register,
      inventoryMarkdown: fullInventory(),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /Unknown PROVENANCE.md register status/);
  });

  it("fails duplicate inventory ids", () => {
    const result = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown:
        fullInventory() +
        block({ id: "initial-application-source", material: "Other material name" }, ["docs/"]),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /Duplicate inventory id/);
  });

  it("fails duplicate inventory materials", () => {
    const result = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: fullInventory() + block({ id: "dup-material", material: APP_MATERIAL }, ["electron/"]),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /Duplicate inventory material/);
  });

  it("fails multiple inventory records mapping to one register row", () => {
    const result = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: fullInventory() + block({ id: "second-app-record", material: APP_MATERIAL }, ["electron/"]),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /Multiple inventory records map to register row/);
  });

  it("fails orphan inventory unless informational", () => {
    const orphan = block({ id: "stray", material: "Not in the register" }, ["tmp/"]);
    const fail = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: fullInventory(orphan),
    });
    assert.equal(fail.ok, false);
    assert.match(fail.failures.join("\n"), /Orphan inventory record/);
    const ok = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: fullInventory(block({ id: "stray", material: "Not in the register", informational: "true" }, ["tmp/"])),
    });
    assert.equal(ok.ok, true, ok.failures.join("; "));
  });

  it("fails missing required fields and secret paths", () => {
    const missing = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: "```provenance-record\nid: x\nmaterial: nope\nstatus: unresolved\n```\n" + fullInventory(),
    });
    assert.equal(missing.ok, false);
    const secrets = verifyProvenance({
      registerMarkdown: LIVE_REGISTER,
      inventoryMarkdown: fullInventory().replace("- src/", "- src/\n- provider-settings.json"),
    });
    assert.equal(secrets.ok, false);
    assert.match(secrets.failures.join("\n"), /forbidden secret path/);
  });

  it("parses live files: three items stay unresolved and bf3396e scope is partitioned", async () => {
    const result = await verifyFromDisk(projectRootFrom());
    assert.equal(result.ok, true, result.failures.join("; "));
    assert.equal(result.unverifiedCount, 3);
    const register = parseProvenanceRegister(await readFile(new URL("../PROVENANCE.md", import.meta.url), "utf8"));
    const inventory = parseInventoryRecords(
      await readFile(new URL("./SOURCE_INVENTORY.md", import.meta.url), "utf8"),
    );
    const unresolvedIds = inventory.filter((r) =>
      register.some((row) => row.material === r.material && row.status === "unverified"),
    );
    assert.equal(unresolvedIds.length, 3);
    for (const rec of unresolvedIds) {
      assert.equal(rec.status, "unresolved");
      assert.equal(rec.evidence_reference, "none");
    }
    const listed = inventory.filter((r) => r.informational !== "true").map((r) => r.material).sort();
    assert.deepEqual(listed, register.map((r) => r.material).sort());

    const app = inventory.find((r) => r.id === "initial-application-source");
    const fixtures = inventory.find((r) => r.id === "legacy-benchmark-fixtures");
    assert.equal(app.scope_kind, "entire_tree_at_commit");
    assert.ok(app.exclusions.includes("package-lock.json"));
    const listedTree = spawnSync("git", ["ls-tree", "-r", "--name-only", INITIAL_IMPORT_COMMIT], {
      encoding: "utf8",
      cwd: projectRootFrom(),
    });
    assert.equal(listedTree.status, 0, listedTree.stderr);
    const files = listedTree.stdout.trim().split("\n").filter(Boolean);
    assert.ok(files.length > 1000);
    let fixtureCount = 0;
    let appCount = 0;
    let lockCount = 0;
    for (const file of files) {
      const inFixtures = fixtures.paths.some((p) => posixPrefixMatch(file, p));
      const inApp = pathInEntireTreeScope(file, app.exclusions);
      if (file === "package-lock.json") {
        lockCount += 1;
        assert.equal(inApp, false);
        assert.equal(inFixtures, false);
        continue;
      }
      if (inFixtures) {
        fixtureCount += 1;
        assert.equal(inApp, false, `fixture also in app scope: ${file}`);
        continue;
      }
      assert.equal(inApp, true, `unscoped initial-import path: ${file}`);
      appCount += 1;
    }
    assert.ok(fixtureCount > 0);
    assert.ok(appCount > 0);
    assert.equal(lockCount, 1);
    assert.equal(fixtureCount + appCount + lockCount, files.length);
  });
});
