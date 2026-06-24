import type { ProviderId } from "./settings.cjs";
import type { HealthResult, ProviderResponse } from "./types.cjs";
import type { AIPlan, PlanContext } from "./aiPlan.cjs";
import type { PatchTargetFile } from "./aiPatch.cjs";
import type { ApplyPlanBatchPatchMeta } from "./applyPlanPatch.cjs";
import { normalizeApplyPlanPath } from "./markedFileParse.cjs";
import { GREENFIELD_PATHS } from "../greenfield/paths.cjs";
import type { GreenfieldGenerateResult, GeneratedFile } from "../greenfield/generate.cjs";

export const MOCK_MODEL = "mock-deterministic";

export function isMockProviderEnabled(): boolean {
  return process.env.BRYANTLABS_MOCK_PROVIDER === "1";
}

function latencyMs(): number {
  return 5 + Math.floor(Math.random() * 8);
}

function isGameplayPrompt(promptLower: string): boolean {
  return (
    /\b(notes mode|hint system|hints|mistake counter|game over|win modal|gameplay|keyboard controls|statistics panel|difficulty selector|matching numbers)\b/.test(
      promptLower,
    ) ||
    /\b(easier to play|real sudoku|enjoyable to play)\b/.test(promptLower)
  );
}

function planFilesForPrompt(userPrompt: string): AIPlan["files"] {
  const lower = userPrompt.toLowerCase();
  if (isGameplayPrompt(lower)) {
    return [
      { path: "src/App.tsx", reason: "Gameplay logic and state" },
      { path: "src/index.css", reason: "Modal and panel styles" },
    ];
  }
  if (lower.includes("timer")) {
    return [{ path: "src/App.tsx", reason: "Add timer UI and state" }];
  }
  if (/\b(blue|style|css|premium|theme|layout)\b/.test(lower)) {
    return [
      { path: "src/App.tsx", reason: "UI structure" },
      { path: "src/index.css", reason: "Visual styling" },
    ];
  }
  return [{ path: "src/App.tsx", reason: "Primary app surface" }];
}

export function mockHealth(provider: ProviderId): HealthResult {
  return {
    ok: true,
    provider,
    model: MOCK_MODEL,
    checks: [{ label: "Mock provider", ok: true, detail: "Deterministic E2E mode" }],
    models: [MOCK_MODEL],
    connectionStatus: "connected",
  };
}

export function mockTest(provider: ProviderId, prompt: string): ProviderResponse {
  return {
    ok: true,
    provider,
    model: MOCK_MODEL,
    text: `Mock response for: ${prompt.slice(0, 120)}`,
    raw: { mock: true },
    latencyMs: latencyMs(),
  };
}

function mockAgentStepArgs(prompt: string): Record<string, unknown> {
  const lower = prompt.toLowerCase();
  if (lower.includes("search_symbols") || lower.includes("symbol")) {
    return {
      thought: "Search for relevant symbols.",
      reason: "Mock native tool call",
      action: "search_symbols",
      params: { query: "timer" },
      actionDetail: 'SearchSymbols("timer")',
    };
  }
  if (lower.includes("read_file") || lower.includes("app.tsx")) {
    return {
      thought: "Read App.tsx for context.",
      reason: "Mock native tool call",
      action: "read_file",
      params: { path: "src/App.tsx" },
      actionDetail: 'ReadFile("src/App.tsx")',
    };
  }
  return {
    thought: "Start with verification.",
    reason: "Mock native tool call",
    action: "run_verification",
    params: {},
    actionDetail: "RunVerification",
  };
}

export function mockAgentStep(
  provider: ProviderId,
  prompt: string,
): {
  ok: boolean;
  provider: ProviderId;
  model: string;
  text: string;
  nativeArgs: Record<string, unknown>;
  nativeToolCall: boolean;
  latencyMs: number;
  raw: unknown;
} {
  const nativeArgs = mockAgentStepArgs(prompt);
  return {
    ok: true,
    provider,
    model: MOCK_MODEL,
    text: JSON.stringify(nativeArgs),
    nativeArgs,
    nativeToolCall: true,
    latencyMs: latencyMs(),
    raw: { mock: true, nativeToolCall: true },
  };
}

export interface MockAIPlanResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  plan?: AIPlan;
  raw: unknown;
  rawText?: string;
  latencyMs: number;
  telemetry?: {
    parse_fail_reason: string;
    truncation_detected: boolean;
    retry_success: boolean;
    retried: boolean;
    repair_attempted: boolean;
    repair_success: boolean;
  };
}

export function mockRunPlan(
  provider: ProviderId,
  userPrompt: string,
  _context: PlanContext,
): MockAIPlanResult {
  const files = planFilesForPrompt(userPrompt);
  const plan: AIPlan = {
    summary: `Mock plan: ${userPrompt.slice(0, 100)}`,
    files,
    reasoning: "Deterministic mock planner for CI/E2E.",
    risks: [],
    confidence: "High",
  };
  return {
    ok: true,
    provider,
    model: MOCK_MODEL,
    plan,
    raw: { mock: true },
    rawText: JSON.stringify(plan),
    latencyMs: latencyMs(),
    telemetry: {
      parse_fail_reason: "no_json",
      truncation_detected: false,
      retry_success: false,
      retried: false,
      repair_attempted: false,
      repair_success: false,
    },
  };
}

function patchAppTsx(content: string, promptLower: string): string {
  if (isGameplayPrompt(promptLower)) {
    const marker = "// mock: gameplay upgrade";
    if (content.includes(marker)) return content;
    return `${content.trimEnd()}\n${marker}\nexport const MOCK_GAMEPLAY = true;\n`;
  }
  if (promptLower.includes("timer")) {
    const marker = "// mock: timer enhancement";
    if (content.includes(marker)) return content;
    return content.replace(
      /export function App\(\)/,
      `${marker}\nexport function App()`,
    );
  }
  if (promptLower.includes("blue")) {
    if (content.includes('className="blue-theme"')) return content;
    return content.replace("<main>", '<main className="blue-theme">');
  }
  return `${content.trimEnd()}\n// mock apply\n`;
}

function patchIndexCss(content: string, promptLower: string): string {
  if (isGameplayPrompt(promptLower)) {
    return `${content.trimEnd()}\n.mock-gameplay { display: block; }\n`;
  }
  if (/\b(blue|style|css|premium|theme)\b/.test(promptLower)) {
    return `${content.trimEnd()}\n.blue-theme { color: #4a90e2; }\n`;
  }
  return `${content.trimEnd()}\n/* mock styles */\n`;
}

function patchFileContent(
  relPath: string,
  content: string,
  promptLower: string,
): string {
  const norm = normalizeApplyPlanPath(relPath);
  if (norm === "src/App.tsx") return patchAppTsx(content, promptLower);
  if (norm === "src/index.css") return patchIndexCss(content, promptLower);
  return `${content.trimEnd()}\n/* mock patch */\n`;
}

export interface MockApplyPlanBatchPatchResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  raw: unknown;
  rawText?: string;
  latencyMs: number;
  error?: string;
  files?: Record<string, string>;
  missingPaths?: string[];
  repairAttempted?: boolean;
  directRewrite?: boolean;
  lastModelRawText?: string;
}

export function mockApplyPlanBatchPatch(
  provider: ProviderId,
  userPrompt: string,
  files: readonly PatchTargetFile[],
  _meta: ApplyPlanBatchPatchMeta,
): MockApplyPlanBatchPatchResult {
  const promptLower = userPrompt.toLowerCase();
  const out: Record<string, string> = {};
  for (const file of files) {
    const path = normalizeApplyPlanPath(file.path);
    out[path] = patchFileContent(path, file.content, promptLower);
  }
  const rawText = Object.entries(out)
    .map(([p, c]) => `@@FILE:${p}\n${c}\n@@END`)
    .join("\n\n");
  return {
    ok: true,
    provider,
    model: MOCK_MODEL,
    raw: { mock: true },
    rawText,
    latencyMs: latencyMs(),
    files: out,
    repairAttempted: false,
    directRewrite: Boolean(_meta.directRewrite),
  };
}

function isCalculatorPrompt(prompt: string): boolean {
  return /\bcalculator\b|\bcalc\b/.test(prompt.toLowerCase());
}

const MOCK_CALCULATOR_APP = `export default function App() {
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"];
  return (
    <main className="calculator mock-greenfield">
      <div className="calculator-display" aria-label="display">
        0
      </div>
      <div className="number-pad">
        {keys.map((key) => (
          <button key={key} type="button">
            {key}
          </button>
        ))}
      </div>
    </main>
  );
}`;

const MOCK_CALCULATOR_CSS = `body {
  margin: 0;
  font-family: system-ui, sans-serif;
}

.calculator {
  display: grid;
  gap: 1rem;
  max-width: 320px;
  margin: 2rem auto;
  padding: 1rem;
}

.calculator-display {
  min-height: 48px;
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 8px;
  text-align: right;
}

.number-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.number-pad button {
  width: clamp(52px, 14vw, 80px);
  height: clamp(52px, 14vw, 80px);
  font-size: clamp(1.25rem, 3vw, 1.75rem);
}`;

function greenfieldFileContent(path: string, prompt: string): string {
  const title = prompt.slice(0, 40).replace(/[^\w\s-]/g, "").trim() || "Mock App";
  const calculator = isCalculatorPrompt(prompt);
  switch (path) {
    case "package.json":
      return JSON.stringify(
        {
          name: "mock-greenfield-app",
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc -p tsconfig.json && vite build",
            typecheck: "tsc -p tsconfig.json --noEmit",
            preview: "vite preview",
          },
          dependencies: { react: "^19.2.7", "react-dom": "^19.2.7" },
          devDependencies: {
            "@types/react": "^19.2.16",
            "@types/react-dom": "^19.2.3",
            "@vitejs/plugin-react": "^6.0.2",
            typescript: "^6.0.3",
            vite: "^8.0.16",
          },
        },
        null,
        2,
      );
    case "index.html":
      return `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>`;
    case "src/main.tsx":
      return `/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);`;
    case "src/App.tsx":
      if (calculator) return MOCK_CALCULATOR_APP;
      return `export default function App() {
  return (
    <main className="mock-greenfield">
      <h1>${title}</h1>
      <p>Generated by BryantLabs mock provider.</p>
    </main>
  );
}`;
    case "src/index.css":
      if (calculator) return MOCK_CALCULATOR_CSS;
      return `body { margin: 0; font-family: system-ui, sans-serif; }
.mock-greenfield { padding: 2rem; }`;
    case "tsconfig.json":
      return `{"compilerOptions":{"target":"ES2020","lib":["ES2020","DOM","DOM.Iterable"],"module":"ESNext","skipLibCheck":true,"moduleResolution":"bundler","isolatedModules":true,"noEmit":true,"jsx":"react-jsx","strict":true},"include":["src","vite.config.ts"]}`;
    case "vite.config.ts":
      return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()] });`;
    default:
      return `// mock ${path}\n`;
  }
}

export function mockGreenfieldGenerate(
  provider: ProviderId,
  prompt: string,
): GreenfieldGenerateResult {
  const files: GeneratedFile[] = GREENFIELD_PATHS.map((path) => ({
    path,
    content: greenfieldFileContent(path, prompt),
  }));
  return {
    ok: true,
    provider,
    model: MOCK_MODEL,
    files,
    rawText: files.map((f) => `@@FILE:${f.path}@@\n${f.content}\n@@END:${f.path}@@`).join("\n"),
    latencyMs: latencyMs(),
  };
}
