import { join } from "node:path";
import { createPilotTrial, parseTaskId } from "./createTrial.ts";
import { cleanupTrial, evaluateTrial } from "./evaluate.ts";
import { canonicalPrompt } from "./tasks.ts";
import {
  buildScorecardEntry,
  readScorecard,
  summarizeScorecards,
  writeScorecard,
} from "./scorecard.ts";

export async function runPilotCli(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help") {
    process.stdout.write(helpText());
    return 0;
  }
  switch (cmd) {
    case "create-trial":
      return createTrialCmd(rest);
    case "prompt":
      return promptCmd(rest);
    case "evaluate":
      return evaluateCmd(rest);
    case "record-scorecard":
      return recordCmd(rest);
    case "validate-scorecard":
      return validateCmd(rest);
    case "summarize":
      return summarizeCmd(rest);
    case "cleanup":
      return cleanupCmd(rest);
    default:
      process.stderr.write(`Unknown command: ${cmd}\n`);
      process.stderr.write(helpText());
      return 1;
  }
}

function helpText(): string {
  return `BryantLabs Studio vs Cursor pilot harness (no product automation, no provider calls).

Commands:
  create-trial --task G1|R1|D1|U1|F1 --product studio|cursor
  prompt --task G1|R1|D1|U1|F1
  evaluate --trial <dir> [--skip-verify]
  record-scorecard --trial <dir> --model <id> --wall-time-ms <n> --run-ref <text-or-sha256> [--out <file>]
                   [--api-calls <n>] [--input-tokens <n>] [--output-tokens <n>]
                   [--repair-attempts <n>] [--human-interventions <n>] [--notes <text>]
                   [--skip-verify]
  validate-scorecard --entry <file>
  summarize --dir <dir>
  cleanup --trial <dir>

Omitted --api-calls / --input-tokens / --output-tokens are stored as unavailable, never 0.
Task and product are taken from the sealed trial manifest, not from scorecard flags.
`;
}

function flag(args: readonly string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

function has(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function numericFlag(args: readonly string[], name: string): number | undefined {
  const raw = flag(args, name);
  if (raw == null) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

async function createTrialCmd(args: readonly string[]): Promise<number> {
  const task = flag(args, "--task");
  const product = flag(args, "--product");
  if (!task || !product) {
    process.stderr.write("create-trial requires --task and --product\n");
    return 1;
  }
  const result = await createPilotTrial({ taskId: task, product });
  process.stdout.write(`${result.manifest.trialRoot}\n`);
  process.stderr.write(`openPath=${result.manifest.openPath}\n`);
  if (result.manifest.outsideDir) {
    process.stderr.write(`outsideDir=${result.manifest.outsideDir}\n`);
    process.stderr.write(`sentinelPath=${result.manifest.sentinelPath}\n`);
  }
  process.stderr.write(`${result.prompt}\n`);
  return 0;
}

function promptCmd(args: readonly string[]): number {
  const task = flag(args, "--task");
  if (!task) {
    process.stderr.write("prompt requires --task\n");
    return 1;
  }
  process.stdout.write(`${canonicalPrompt(parseTaskId(task))}\n`);
  return 0;
}

async function evaluateCmd(args: readonly string[]): Promise<number> {
  const trial = flag(args, "--trial");
  if (!trial) {
    process.stderr.write("evaluate requires --trial\n");
    return 1;
  }
  const evaluation = await evaluateTrial(trial, { runVerify: !has(args, "--skip-verify") });
  process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
  return evaluation.passed ? 0 : 1;
}

async function recordCmd(args: readonly string[]): Promise<number> {
  const trial = flag(args, "--trial");
  const model = flag(args, "--model");
  const wall = flag(args, "--wall-time-ms");
  const runRef = flag(args, "--run-ref");
  if (!trial || !model || !wall || !runRef) {
    process.stderr.write("record-scorecard requires --trial --model --wall-time-ms --run-ref\n");
    return 1;
  }
  const evaluation = await evaluateTrial(trial, { runVerify: !has(args, "--skip-verify") });
  const entry = buildScorecardEntry({
    evaluation,
    model,
    wallTimeMs: Number(wall),
    apiCalls: numericFlag(args, "--api-calls"),
    inputTokens: numericFlag(args, "--input-tokens"),
    outputTokens: numericFlag(args, "--output-tokens"),
    repairAttempts: Number(flag(args, "--repair-attempts") ?? "0"),
    humanInterventions: Number(flag(args, "--human-interventions") ?? "0"),
    notes: flag(args, "--notes") ?? "",
    transcriptOrRunReference: runRef,
  });
  const out = flag(args, "--out") ?? join(trial, "scorecard.json");
  await writeScorecard(out, entry);
  process.stdout.write(`${out}\n`);
  process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
  return entry.passed ? 0 : 1;
}

async function validateCmd(args: readonly string[]): Promise<number> {
  const entryPath = flag(args, "--entry");
  if (!entryPath) {
    process.stderr.write("validate-scorecard requires --entry\n");
    return 1;
  }
  const entry = await readScorecard(entryPath);
  if (entry.trialRoot) {
    const evaluation = await evaluateTrial(entry.trialRoot, { runVerify: !has(args, "--skip-verify") });
    if (evaluation.taskId !== entry.taskId || evaluation.product !== entry.product) {
      process.stderr.write("Scorecard task/product does not match the sealed trial identity\n");
      return 1;
    }
    if (evaluation.passed !== entry.passed || evaluation.passed !== entry.evaluationPassed) {
      process.stderr.write("Scorecard pass flag does not match a fresh evaluation of the trial\n");
      return 1;
    }
  }
  process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
  return 0;
}

async function summarizeCmd(args: readonly string[]): Promise<number> {
  const dir = flag(args, "--dir");
  if (!dir) {
    process.stderr.write("summarize requires --dir\n");
    return 1;
  }
  const { markdown } = await summarizeScorecards(dir);
  process.stdout.write(markdown);
  return 0;
}

async function cleanupCmd(args: readonly string[]): Promise<number> {
  const trial = flag(args, "--trial");
  if (!trial) {
    process.stderr.write("cleanup requires --trial\n");
    return 1;
  }
  const removed = await cleanupTrial(trial);
  process.stdout.write(removed.join("\n") + (removed.length ? "\n" : ""));
  return 0;
}
