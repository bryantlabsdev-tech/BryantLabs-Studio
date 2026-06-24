import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepairReplayReport } from "./repairReplay";
import type { StressSuiteResult } from "./types";

const RESULTS_DIR = join(process.cwd(), "benchmarks", "results");
const STRESS_HISTORY = join(RESULTS_DIR, "stress-history.jsonl");
const REPLAY_HISTORY = join(RESULTS_DIR, "replay-history.jsonl");

export async function writeStressArtifacts(
  result: StressSuiteResult,
  markdown: string,
  options?: { readonly suiteId?: "full" | "fast" | "single" },
): Promise<{ jsonPath: string; markdownPath: string; historyPath: string }> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = result.finishedAt.replace(/[:.]/g, "-");
  const jsonPath = join(RESULTS_DIR, `stress-${stamp}.json`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(join(RESULTS_DIR, "stress-latest.md"), `${markdown}\n`, "utf8");
  await writeFile(join(RESULTS_DIR, "stress-latest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const suiteId = options?.suiteId ?? result.suiteId ?? "full";
  if (suiteId === "fast") {
    await writeFile(join(RESULTS_DIR, "stress-fast-latest.md"), `${markdown}\n`, "utf8");
    await writeFile(
      join(RESULTS_DIR, "stress-fast-latest.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
  }

  await appendFile(STRESS_HISTORY, `${JSON.stringify(result)}\n`, "utf8");
  return {
    jsonPath,
    markdownPath: join(RESULTS_DIR, "stress-latest.md"),
    historyPath: STRESS_HISTORY,
  };
}

export async function writeReplayArtifacts(
  report: RepairReplayReport,
  markdown: string,
): Promise<{ markdownPath: string; jsonPath: string }> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(RESULTS_DIR, `replay-${stamp}.json`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(RESULTS_DIR, "repair-replay-latest.md"), `${markdown}\n`, "utf8");
  await writeFile(
    join(RESULTS_DIR, "repair-replay-latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await appendFile(REPLAY_HISTORY, `${JSON.stringify(report)}\n`, "utf8");
  return {
    markdownPath: join(RESULTS_DIR, "repair-replay-latest.md"),
    jsonPath,
  };
}

export async function readPreviousStressResult(): Promise<StressSuiteResult | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(STRESS_HISTORY, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return null;
    return JSON.parse(lines[lines.length - 2]!) as StressSuiteResult;
  } catch {
    return null;
  }
}
