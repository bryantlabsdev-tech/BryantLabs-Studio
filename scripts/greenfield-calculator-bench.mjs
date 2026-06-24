/**
 * Bench: 5 calculator greenfield generations via Gemini (reads saved app settings).
 * Usage: npm run build:electron && node scripts/greenfield-calculator-bench.mjs
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as gemini from "../dist-electron/providers/gemini.cjs";
import {
  buildGreenfieldPrompt,
  parseGreenfieldResponse,
} from "../dist-electron/greenfield/generate.cjs";
import { auditGreenfieldMarkers } from "../dist-electron/greenfield/promptAudit.cjs";
import { GREENFIELD_MAX_OUTPUT_TOKENS } from "../dist-electron/greenfield/metrics.cjs";
import { GREENFIELD_PATHS } from "../dist-electron/greenfield/paths.cjs";

const PROMPT = "Build a calculator app";
const RUNS = 5;
const GENERATE_TIMEOUT_MS = 120_000;

const settingsPath = join(
  homedir(),
  "Library/Application Support/bryantlabs-studio/provider-settings.json",
);

function normalizeSettings(parsed) {
  const geminiApiKey =
    typeof parsed.geminiApiKey === "string" ? parsed.geminiApiKey : "";
  let geminiModel =
    typeof parsed.geminiModel === "string"
      ? parsed.geminiModel
      : "gemini-2.5-flash";
  if (geminiModel === "gemini-2.0-flash") geminiModel = "gemini-2.5-flash";
  return {
    provider: "gemini",
    geminiModel,
    geminiApiKey,
    ollamaModel: parsed.ollamaModel ?? "llama3.2",
    ollamaBaseUrl: parsed.ollamaBaseUrl ?? "http://127.0.0.1:11434",
  };
}

async function main() {
  let settings;
  try {
    const text = await readFile(settingsPath, "utf8");
    settings = normalizeSettings(JSON.parse(text));
  } catch {
    console.error(
      `Could not read ${settingsPath} — save a Gemini API key in BryantLabs Studio first.`,
    );
    process.exit(1);
  }

  if (!settings.geminiApiKey.trim()) {
    console.error("Gemini API key is empty in provider-settings.json.");
    process.exit(1);
  }

  const prompt = buildGreenfieldPrompt(PROMPT);
  console.log(`maxOutputTokens: ${GREENFIELD_MAX_OUTPUT_TOKENS}`);
  console.log(`prompt chars: ${prompt.length}`);
  console.log(`file order: ${GREENFIELD_PATHS.join(", ")}`);
  console.log("---");

  const rows = [];
  for (let i = 1; i <= RUNS; i++) {
    const res = await gemini.generate(settings, prompt, GREENFIELD_MAX_OUTPUT_TOKENS, {
      timeoutMs: GENERATE_TIMEOUT_MS,
      operation: "greenfield",
    });
    const rawLen = res.text?.length ?? 0;
    const files = res.ok ? parseGreenfieldResponse(res.text) : null;
    const audit = res.text ? auditGreenfieldMarkers(res.text, prompt) : null;
    const appEndClosed = res.text?.includes("@@END:src/App.tsx@@") ?? false;
    const row = {
      run: i,
      ok: Boolean(files),
      providerOk: res.ok,
      model: res.model,
      responseChars: rawLen,
      missingFiles: audit?.missingFiles ?? GREENFIELD_PATHS,
      appEndClosed,
      error: res.error,
    };
    rows.push(row);
    console.log(
      JSON.stringify({
        run: i,
        ok: row.ok,
        responseChars: rawLen,
        missing: row.missingFiles,
        appEndClosed,
      }),
    );
    if (i < RUNS) await new Promise((r) => setTimeout(r, 2000));
  }

  const successes = rows.filter((r) => r.ok).length;
  console.log("---");
  console.log(
    JSON.stringify(
      {
        successCount: successes,
        failCount: RUNS - successes,
        runs: rows,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
