#!/usr/bin/env node
/**
 * Read-only provenance register/inventory checker.
 * Does not inspect secrets, provider settings, or .env files.
 * Does not modify any files.
 * A well-formed evidence_reference is a citation, not proof that off-Git files are authentic.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const INITIAL_IMPORT_COMMIT = "bf3396e030becf03a17295a329f0506b2df6f197";

export const ALLOWED_INVENTORY_STATUSES = new Set([
  "unresolved",
  "unknown",
  "requires_replacement",
  "verified",
]);

export const ALLOWED_REGISTER_STATUSES = new Set([
  "unverified",
  "verified",
  "partially_documented",
  "machine_checked_not_legally_cleared",
]);

export const EVIDENCE_RECORD_TYPES = new Set([
  "owner_attestation",
  "third_party_license",
  "replacement_record",
  "dependency_license_scan",
]);

export const REQUIRED_FIELDS = [
  "id",
  "material",
  "status",
  "introducing_commit",
  "git_author",
  "git_committer",
  "author_date",
  "committer_date",
  "generated_or_authored",
  "copyright_ownership",
  "dependency_licensing",
  "trademark_clearance",
  "evidence_reference",
  "scope_kind",
  "missing_evidence",
];

const FORBIDDEN_BASENAMES = new Set([
  "provider-settings.json",
  "credentials.json",
  ".env",
  ".env.local",
  ".env.production",
]);

const PLACEHOLDER_EVIDENCE = new Set(["", "none", "n/a", "na", "unknown", "tbd", "placeholder", "foo", "bar"]);

export function projectRootFrom(moduleUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}

export function normalizeRegisterStatus(raw) {
  const status = String(raw ?? "")
    .replace(/\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (status === "partially documented") return "partially_documented";
  if (status === "machine checked, not legally cleared") return "machine_checked_not_legally_cleared";
  return status.replace(/ /g, "_");
}

export function parseProvenanceRegister(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const [material, evidence, statusRaw] = cells;
    if (!material || material === "Material" || /^-+$/.test(material)) continue;
    rows.push({
      material,
      evidence,
      statusRaw: statusRaw.replace(/\*/g, "").trim(),
      status: normalizeRegisterStatus(statusRaw),
    });
  }
  return rows;
}

export function parseInventoryRecords(markdown) {
  const records = [];
  const fence = /```provenance-record\n([\s\S]*?)```/g;
  let match;
  while ((match = fence.exec(markdown))) {
    records.push(parseRecordBlock(match[1]));
  }
  return records;
}

function parseRecordBlock(body) {
  const rec = { paths: [], exclusions: [] };
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim() === "paths:" || line.trim() === "exclusions:") {
      const key = line.trim() === "paths:" ? "paths" : "exclusions";
      i += 1;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        rec[key].push(lines[i].replace(/^\s*-\s+/, "").trim());
        i += 1;
      }
      continue;
    }
    const idx = line.indexOf(":");
    if (idx < 1) {
      i += 1;
      continue;
    }
    rec[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    i += 1;
  }
  return rec;
}

export function parseEvidenceReference(value) {
  if (value == null) return { ok: false, kind: "missing", error: "missing evidence_reference" };
  const raw = String(value).trim();
  if (raw.toLowerCase() === "none") return { ok: true, kind: "none" };
  if (PLACEHOLDER_EVIDENCE.has(raw.toLowerCase())) {
    return { ok: false, kind: "placeholder", error: "placeholder evidence_reference" };
  }
  const parts = {};
  for (const piece of raw.split(";")) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) return { ok: false, kind: "malformed", error: `malformed evidence token: ${trimmed}` };
    parts[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  const evidenceId = parts.evidence_id ?? "";
  const recordType = parts.record_type ?? "";
  const date = parts.date ?? "";
  const reviewer = parts.reviewer ?? "";
  const storedLocation = parts.stored_location ?? "";
  const sha = (parts.content_sha256 ?? "").toLowerCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(evidenceId)) {
    return { ok: false, kind: "malformed", error: "evidence_id must be 3–64 letters, digits, dot, underscore, or hyphen" };
  }
  if (!EVIDENCE_RECORD_TYPES.has(recordType)) {
    return { ok: false, kind: "malformed", error: `record_type must be one of ${[...EVIDENCE_RECORD_TYPES].join(", ")}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, kind: "malformed", error: "date must be YYYY-MM-DD" };
  }
  if (reviewer.length < 2 || PLACEHOLDER_EVIDENCE.has(reviewer.toLowerCase())) {
    return { ok: false, kind: "malformed", error: "reviewer is missing or a placeholder" };
  }
  const hasLocation = storedLocation.length > 2 && !PLACEHOLDER_EVIDENCE.has(storedLocation.toLowerCase());
  const hasHash = /^[a-f0-9]{64}$/.test(sha);
  if (!hasLocation && !hasHash) {
    return {
      ok: false,
      kind: "malformed",
      error: "verified evidence needs stored_location or content_sha256 (64 hex chars)",
    };
  }
  return {
    ok: true,
    kind: "structured",
    evidenceId,
    recordType,
    date,
    reviewer,
    storedLocation: hasLocation ? storedLocation : "",
    contentSha256: hasHash ? sha : "",
  };
}

export function forbiddenPath(entry) {
  const base = path.basename(String(entry).split(/\s/)[0] ?? "");
  if (FORBIDDEN_BASENAMES.has(base)) return true;
  if (base.startsWith(".env")) return true;
  return false;
}

export function posixPrefixMatch(file, prefix) {
  const n = file.replaceAll("\\", "/");
  const p = prefix.replaceAll("\\", "/").replace(/\/$/, "");
  if (n === p) return true;
  return n.startsWith(`${p}/`);
}

export function pathInEntireTreeScope(file, exclusions) {
  const n = file.replaceAll("\\", "/");
  for (const ex of exclusions) {
    const item = ex.replaceAll("\\", "/");
    if (item.endsWith("/")) {
      if (posixPrefixMatch(n, item)) return false;
      continue;
    }
    if (n === item) return false;
  }
  return true;
}

export function verifyProvenance({ registerMarkdown, inventoryMarkdown }) {
  const failures = [];
  const register = parseProvenanceRegister(registerMarkdown);
  const records = parseInventoryRecords(inventoryMarkdown);

  for (const row of register) {
    if (!ALLOWED_REGISTER_STATUSES.has(row.status)) {
      failures.push(`Unknown PROVENANCE.md register status "${row.statusRaw}" for ${row.material}`);
    }
  }

  const ids = new Map();
  const materials = new Map();
  for (const rec of records) {
    const id = rec.id ?? "?";
    if (rec.id) {
      if (ids.has(rec.id)) failures.push(`Duplicate inventory id: ${rec.id}`);
      else ids.set(rec.id, rec);
    }
    if (rec.material) {
      if (materials.has(rec.material)) failures.push(`Duplicate inventory material: ${rec.material}`);
      else materials.set(rec.material, rec);
    }
    for (const field of REQUIRED_FIELDS) {
      if (typeof rec[field] !== "string" || rec[field].trim() === "") {
        failures.push(`Record ${id} missing required field ${field}`);
      }
    }
    if (rec.scope_kind === "path_list") {
      if (!Array.isArray(rec.paths) || rec.paths.length === 0) {
        failures.push(`Record ${id} with scope_kind path_list needs a non-empty paths list`);
      }
    } else if (rec.scope_kind === "entire_tree_at_commit") {
      if (!Array.isArray(rec.exclusions)) {
        failures.push(`Record ${id} with entire_tree_at_commit needs exclusions (may be empty)`);
      }
    } else if (rec.scope_kind) {
      failures.push(`Record ${id} has unsupported scope_kind ${rec.scope_kind}`);
    }
    if (rec.status && !ALLOWED_INVENTORY_STATUSES.has(rec.status)) {
      failures.push(`Record ${id} has unsupported status ${rec.status}`);
    }
    const evidence = parseEvidenceReference(rec.evidence_reference);
    if (rec.status === "verified") {
      if (evidence.kind === "none" || !evidence.ok) {
        failures.push(
          `Record ${id} is marked verified without a structured evidence_reference (${evidence.error ?? "none"})`,
        );
      }
    } else if (rec.evidence_reference && rec.evidence_reference !== "none" && !evidence.ok) {
      failures.push(`Record ${id} has an invalid evidence_reference: ${evidence.error}`);
    }
    for (const p of [...(rec.paths ?? []), ...(rec.exclusions ?? [])]) {
      if (forbiddenPath(p)) failures.push(`Record ${id} lists a forbidden secret path: ${p}`);
    }
  }

  const claimedMaterials = new Map();
  for (const rec of records) {
    const informational = rec.informational === "true";
    if (informational) continue;
    if (!rec.material) continue;
    const matches = register.filter((row) => row.material === rec.material);
    if (matches.length === 0) {
      failures.push(`Orphan inventory record ${rec.id} has no matching PROVENANCE.md row (set informational: true if intentional)`);
    }
    if (matches.length > 1) {
      failures.push(`Inventory ${rec.id} material matches multiple register rows`);
    }
    if (matches.length === 1) {
      if (claimedMaterials.has(rec.material)) {
        failures.push(`Multiple inventory records map to register row: ${rec.material}`);
      } else {
        claimedMaterials.set(rec.material, rec);
      }
    }
  }

  for (const row of register) {
    if (!ALLOWED_REGISTER_STATUSES.has(row.status)) continue;
    const rec = claimedMaterials.get(row.material);
    if (!rec) {
      failures.push(`PROVENANCE.md row has no inventory record: ${row.material}`);
      continue;
    }
    if (row.status === "verified") {
      const evidence = parseEvidenceReference(rec.evidence_reference);
      if (rec.status !== "verified" || !evidence.ok || evidence.kind !== "structured") {
        failures.push(
          `Register row marked Verified requires inventory status verified and a structured evidence_reference: ${row.material}`,
        );
      }
    } else if (rec.status === "verified") {
      failures.push(`Inventory ${rec.id} is verified but PROVENANCE.md row is not Verified: ${row.material}`);
    }
  }

  const unverified = register.filter((r) => r.status === "unverified");
  return {
    ok: failures.length === 0,
    failures,
    unverifiedCount: unverified.length,
    recordCount: records.length,
    registerCount: register.length,
  };
}

export async function verifyFromDisk(root) {
  const registerMarkdown = await readFile(path.join(root, "PROVENANCE.md"), "utf8");
  const inventoryMarkdown = await readFile(path.join(root, "provenance", "SOURCE_INVENTORY.md"), "utf8");
  return verifyProvenance({ registerMarkdown, inventoryMarkdown });
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const root = projectRootFrom();
  const result = await verifyFromDisk(root);
  if (!result.ok) {
    process.stderr.write(`${result.failures.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `provenance:check ok; register_rows=${result.registerCount} unverified=${result.unverifiedCount} inventory_records=${result.recordCount}\n`,
  );
}
