import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256Text } from "./fs.ts";
import { PILOT_PRODUCTS, PILOT_TASK_IDS, SCORECARD_VERSION } from "./types.ts";
import type { OptionalMetric, PilotScorecard, TrialEvaluation } from "./types.ts";

export class ScorecardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScorecardValidationError";
  }
}

export function unavailableMetric(): OptionalMetric {
  return { status: "unavailable" };
}

export function recordedMetric(value: number): OptionalMetric {
  if (!Number.isFinite(value) || value < 0) {
    throw new ScorecardValidationError(`Metric value must be a finite number >= 0, got ${value}`);
  }
  return { status: "recorded", value };
}

export function parseOptionalMetric(raw: unknown, field: string): OptionalMetric {
  if (raw === undefined) return unavailableMetric();
  if (raw === null) return unavailableMetric();
  if (typeof raw === "string" && raw.trim().toLowerCase() === "unavailable") {
    return unavailableMetric();
  }
  if (typeof raw === "object" && raw !== null && "status" in raw) {
    const rec = raw as { status: string; value?: unknown };
    if (rec.status === "unavailable") {
      if ("value" in rec && rec.value !== undefined) {
        throw new ScorecardValidationError(`${field} cannot pair unavailable with a value`);
      }
      return unavailableMetric();
    }
    if (rec.status === "recorded") {
      if (typeof rec.value !== "number") {
        throw new ScorecardValidationError(`${field}.value must be a number when status is recorded`);
      }
      return recordedMetric(rec.value);
    }
    throw new ScorecardValidationError(`${field}.status must be unavailable or recorded`);
  }
  if (typeof raw === "number") {
    return recordedMetric(raw);
  }
  throw new ScorecardValidationError(`${field} must be an OptionalMetric or omitted`);
}

export function formatMetric(metric: OptionalMetric): string {
  return metric.status === "unavailable" ? "unavailable" : String(metric.value);
}

export function buildScorecardEntry(input: {
  readonly evaluation: TrialEvaluation;
  readonly model: string;
  readonly wallTimeMs: number;
  readonly apiCalls?: unknown;
  readonly inputTokens?: unknown;
  readonly outputTokens?: unknown;
  readonly repairAttempts: number;
  readonly humanInterventions: number;
  readonly notes: string;
  readonly transcriptOrRunReference: string;
}): PilotScorecard {
  if (!Number.isFinite(input.wallTimeMs) || input.wallTimeMs < 0) {
    throw new ScorecardValidationError("wallTimeMs must be a finite number >= 0");
  }
  if (!Number.isInteger(input.repairAttempts) || input.repairAttempts < 0) {
    throw new ScorecardValidationError("repairAttempts must be an integer >= 0");
  }
  if (!Number.isInteger(input.humanInterventions) || input.humanInterventions < 0) {
    throw new ScorecardValidationError("humanInterventions must be an integer >= 0");
  }
  if (!input.model.trim()) {
    throw new ScorecardValidationError("model is required");
  }
  const hashSource = input.transcriptOrRunReference.trim();
  if (!hashSource) {
    throw new ScorecardValidationError("transcript or run-reference is required");
  }
  const passed = input.evaluation.passed;
  return validateScorecard({
    version: SCORECARD_VERSION,
    taskId: input.evaluation.taskId,
    product: input.evaluation.product,
    model: input.model.trim(),
    passed,
    evaluationPassed: passed,
    wallTimeMs: input.wallTimeMs,
    apiCalls: parseOptionalMetric(input.apiCalls, "apiCalls"),
    inputTokens: parseOptionalMetric(input.inputTokens, "inputTokens"),
    outputTokens: parseOptionalMetric(input.outputTokens, "outputTokens"),
    repairAttempts: input.repairAttempts,
    unexpectedChangedPaths: [...input.evaluation.unexpectedChangedPaths],
    humanInterventions: input.humanInterventions,
    notes: input.notes,
    transcriptOrRunReferenceHash: hashSource.startsWith("sha256:")
      ? hashSource
      : `sha256:${sha256Text(hashSource)}`,
    recordedAt: new Date().toISOString(),
    trialRoot: input.evaluation.trialRoot,
  });
}

export function validateScorecard(raw: unknown): PilotScorecard {
  if (typeof raw !== "object" || raw === null) {
    throw new ScorecardValidationError("scorecard must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== SCORECARD_VERSION) {
    throw new ScorecardValidationError(`version must be ${SCORECARD_VERSION}`);
  }
  if (typeof obj.taskId !== "string" || !(PILOT_TASK_IDS as readonly string[]).includes(obj.taskId)) {
    throw new ScorecardValidationError("taskId is invalid");
  }
  if (typeof obj.product !== "string" || !(PILOT_PRODUCTS as readonly string[]).includes(obj.product)) {
    throw new ScorecardValidationError("product is invalid");
  }
  if (typeof obj.model !== "string" || !obj.model.trim()) {
    throw new ScorecardValidationError("model is required");
  }
  if (typeof obj.passed !== "boolean" || typeof obj.evaluationPassed !== "boolean") {
    throw new ScorecardValidationError("passed and evaluationPassed must be booleans");
  }
  if (obj.passed !== obj.evaluationPassed) {
    throw new ScorecardValidationError("passed must equal evaluationPassed");
  }
  if (obj.passed === true && obj.evaluationPassed !== true) {
    throw new ScorecardValidationError("cannot record pass: true when evaluation failed");
  }
  if (typeof obj.wallTimeMs !== "number" || !Number.isFinite(obj.wallTimeMs) || obj.wallTimeMs < 0) {
    throw new ScorecardValidationError("wallTimeMs must be a finite number >= 0");
  }
  const apiCalls = parseOptionalMetric(obj.apiCalls, "apiCalls");
  const inputTokens = parseOptionalMetric(obj.inputTokens, "inputTokens");
  const outputTokens = parseOptionalMetric(obj.outputTokens, "outputTokens");
  if (typeof obj.repairAttempts !== "number" || !Number.isInteger(obj.repairAttempts) || obj.repairAttempts < 0) {
    throw new ScorecardValidationError("repairAttempts must be an integer >= 0");
  }
  if (!Array.isArray(obj.unexpectedChangedPaths) || obj.unexpectedChangedPaths.some((p) => typeof p !== "string")) {
    throw new ScorecardValidationError("unexpectedChangedPaths must be a string array");
  }
  if (typeof obj.humanInterventions !== "number" || !Number.isInteger(obj.humanInterventions) || obj.humanInterventions < 0) {
    throw new ScorecardValidationError("humanInterventions must be an integer >= 0");
  }
  if (typeof obj.notes !== "string") {
    throw new ScorecardValidationError("notes must be a string");
  }
  if (typeof obj.transcriptOrRunReferenceHash !== "string" || !obj.transcriptOrRunReferenceHash.trim()) {
    throw new ScorecardValidationError("transcriptOrRunReferenceHash is required");
  }
  return {
    version: SCORECARD_VERSION,
    taskId: obj.taskId as PilotScorecard["taskId"],
    product: obj.product as PilotScorecard["product"],
    model: obj.model,
    passed: obj.passed,
    evaluationPassed: obj.evaluationPassed,
    wallTimeMs: obj.wallTimeMs,
    apiCalls,
    inputTokens,
    outputTokens,
    repairAttempts: obj.repairAttempts,
    unexpectedChangedPaths: obj.unexpectedChangedPaths as string[],
    humanInterventions: obj.humanInterventions,
    notes: obj.notes,
    transcriptOrRunReferenceHash: obj.transcriptOrRunReferenceHash,
    ...(typeof obj.recordedAt === "string" ? { recordedAt: obj.recordedAt } : {}),
    ...(typeof obj.trialRoot === "string" ? { trialRoot: obj.trialRoot } : {}),
  };
}

export async function writeScorecard(path: string, entry: PilotScorecard): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
}

export async function readScorecard(path: string): Promise<PilotScorecard> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return validateScorecard(raw);
}

export async function summarizeScorecards(dir: string): Promise<{
  readonly entries: readonly PilotScorecard[];
  readonly markdown: string;
}> {
  const names = await readdir(dir);
  const files = names.filter((n) => n.endsWith(".json")).sort();
  const entries: PilotScorecard[] = [];
  for (const name of files) {
    if (name === "MANIFEST.json") continue;
    try {
      entries.push(await readScorecard(join(dir, name)));
    } catch {
      continue;
    }
  }
  return { entries, markdown: formatSummaryMarkdown(entries) };
}

export function formatSummaryMarkdown(entries: readonly PilotScorecard[]): string {
  const lines = [
    "# Cursor parity pilot summary",
    "",
    "Metrics that were not reported by a product are shown as `unavailable`, never as `0`.",
    "",
    "| Task | Product | Model | Result | Wall ms | API calls | In tokens | Out tokens | Repairs | Unexpected paths | Human | Run hash |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- | ---: | --- | ---: | --- |",
  ];
  for (const e of entries) {
    lines.push(
      `| ${e.taskId} | ${e.product} | ${e.model} | ${e.passed ? "pass" : "fail"} | ${e.wallTimeMs} | ${formatMetric(e.apiCalls)} | ${formatMetric(e.inputTokens)} | ${formatMetric(e.outputTokens)} | ${e.repairAttempts} | ${e.unexpectedChangedPaths.length} | ${e.humanInterventions} | \`${e.transcriptOrRunReferenceHash.slice(0, 19)}\` |`,
    );
  }
  if (entries.length === 0) {
    lines.push("| _(none)_ | | | | | | | | | | | |");
  }
  const passed = entries.filter((e) => e.passed).length;
  lines.push("", `Recorded: ${entries.length}. Passed: ${passed}. Failed: ${entries.length - passed}.`);
  return `${lines.join("\n")}\n`;
}
