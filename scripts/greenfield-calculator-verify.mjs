/**
 * Generate calculator app once, validate tsconfig, write to temp dir, run install/tsc/build.
 * Usage: npm run build:electron && node scripts/greenfield-calculator-verify.mjs
 */
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import * as gemini from "../dist-electron/providers/gemini.cjs";
import {
  buildGreenfieldPrompt,
  parseGreenfieldResponse,
} from "../dist-electron/greenfield/generate.cjs";
import { validateGreenfieldFiles } from "../dist-electron/greenfield/validate.cjs";
import { writeGreenfieldFiles } from "../dist-electron/greenfield/write.cjs";
import { GREENFIELD_MAX_OUTPUT_TOKENS } from "../dist-electron/greenfield/metrics.cjs";

const PROMPT = process.env.PROMPT ?? "Build a calculator app";
const GENERATE_TIMEOUT_MS = 120_000;

const settingsPath = join(
  homedir(),
  "Library/Application Support/bryantlabs-studio/provider-settings.json",
);

function normalizeSettings(parsed) {
  let geminiModel =
    typeof parsed.geminiModel === "string"
      ? parsed.geminiModel
      : "gemini-2.5-flash";
  if (geminiModel === "gemini-2.0-flash") geminiModel = "gemini-2.5-flash";
  return {
    provider: "gemini",
    geminiModel,
    geminiApiKey:
      typeof parsed.geminiApiKey === "string" ? parsed.geminiApiKey : "",
    ollamaModel: parsed.ollamaModel ?? "llama3.2",
    ollamaBaseUrl: parsed.ollamaBaseUrl ?? "http://127.0.0.1:11434",
  };
}

function runCmd(command, cwd, timeoutMs = 300_000) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: { ...process.env, CI: "1" } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

async function main() {
  const settings = normalizeSettings(
    JSON.parse(await readFile(settingsPath, "utf8")),
  );
  if (!settings.geminiApiKey.trim()) {
    console.error("Gemini API key missing.");
    process.exit(1);
  }

  const prompt = buildGreenfieldPrompt(PROMPT);
  console.log(`Generating (${PROMPT})…`);
  const res = await gemini.generate(settings, prompt, GREENFIELD_MAX_OUTPUT_TOKENS, {
    timeoutMs: GENERATE_TIMEOUT_MS,
    operation: "greenfield",
  });
  if (!res.ok) {
    console.error("Generate failed:", res.error);
    process.exit(1);
  }

  const files = parseGreenfieldResponse(res.text);
  if (!files) {
    console.error("Parse failed.");
    process.exit(1);
  }

  const validation = validateGreenfieldFiles(files);
  if (!validation.ok) {
    console.error("Validation failed:", validation.errors);
    process.exit(1);
  }

  const tsconfig = files.find((f) => f.path === "tsconfig.json");
  console.log("\n=== generated tsconfig.json ===\n");
  console.log(tsconfig?.content ?? "(missing)");

  const pkg = files.find((f) => f.path === "package.json");
  console.log("\n=== generated package.json ===\n");
  console.log(pkg?.content ?? "(missing)");

  const root = await mkdtemp(join(tmpdir(), "gf-verify-"));
  try {
    const write = await writeGreenfieldFiles(root, files);
    if (!write.ok) {
      console.error("Write failed:", write.errors);
      process.exit(1);
    }

    console.log("\n=== npm install ===");
    const install = await runCmd("npm install", root, 600_000);
    console.log("exit:", install.exitCode);

    console.log("\n=== npx tsc --noEmit ===");
    const tsc = await runCmd("npx tsc --noEmit", root);
    console.log("exit:", tsc.exitCode);
    if (tsc.stdout) console.log("stdout:\n", tsc.stdout);
    if (tsc.stderr) console.log("stderr:\n", tsc.stderr);

    console.log("\n=== npm run build ===");
    const build = await runCmd("npm run build", root);
    console.log("exit:", build.exitCode);
    if (build.stdout) console.log("stdout:\n", build.stdout.slice(-2000));
    if (build.stderr) console.log("stderr:\n", build.stderr.slice(-2000));

    console.log("\n=== summary ===");
    console.log(
      JSON.stringify(
        {
          parseOk: true,
          configValidationOk: true,
          npmInstallExit: install.exitCode,
          tscExit: tsc.exitCode,
          buildExit: build.exitCode,
          responseChars: res.text.length,
        },
        null,
        2,
      ),
    );

    if (install.exitCode !== 0 || tsc.exitCode !== 0 || build.exitCode !== 0) {
      process.exit(1);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
