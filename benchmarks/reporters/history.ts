import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkScorecard } from "../types";

const RESULTS_DIR = join(process.cwd(), "benchmarks", "results");
const HISTORY_FILE = join(RESULTS_DIR, "history.jsonl");
const LATEST_JSON = join(RESULTS_DIR, "latest.json");
const LATEST_MD = join(RESULTS_DIR, "latest.md");

export async function ensureResultsDir(): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
}

export async function writeScorecardArtifacts(
  scorecard: BenchmarkScorecard,
  markdown: string,
): Promise<{ jsonPath: string; markdownPath: string; historyPath: string }> {
  await ensureResultsDir();
  const timestamp = scorecard.finishedAt.replace(/[:.]/g, "-");
  const jsonPath = join(RESULTS_DIR, `scorecard-${timestamp}.json`);
  await writeFile(jsonPath, `${JSON.stringify(scorecard, null, 2)}\n`, "utf8");
  await writeFile(LATEST_JSON, `${JSON.stringify(scorecard, null, 2)}\n`, "utf8");
  await writeFile(LATEST_MD, `${markdown}\n`, "utf8");
  await appendFile(HISTORY_FILE, `${JSON.stringify(scorecard)}\n`, "utf8");
  return { jsonPath, markdownPath: LATEST_MD, historyPath: HISTORY_FILE };
}

export async function readLatestScorecard(): Promise<BenchmarkScorecard | null> {
  try {
    const text = await readFile(LATEST_JSON, "utf8");
    return JSON.parse(text) as BenchmarkScorecard;
  } catch {
    return null;
  }
}

export async function readPreviousScorecard(): Promise<BenchmarkScorecard | null> {
  try {
    const text = await readFile(HISTORY_FILE, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return null;
    return JSON.parse(lines[lines.length - 2]!) as BenchmarkScorecard;
  } catch {
    return null;
  }
}
