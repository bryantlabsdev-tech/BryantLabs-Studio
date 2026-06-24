import {
  loadRawSettings,
  type ProviderId,
} from "../providers/settings.cjs";
import type { ProviderResponse } from "../providers/types.cjs";
import * as anthropic from "../providers/anthropic.cjs";
import * as gemini from "../providers/gemini.cjs";
import * as groq from "../providers/groq.cjs";
import * as ollama from "../providers/ollama.cjs";
import * as openrouter from "../providers/openrouter.cjs";
import {
  buildParseFailureDebug,
  buildProviderFailureDebug,
  type GreenfieldDebugReport,
} from "./debug.cjs";
import { PROVIDER_TIMEOUT_MS } from "../providers/timeouts.cjs";
import {
  GREENFIELD_MAX_OUTPUT_TOKENS,
  buildGenerationMetrics,
  logGreenfieldMetrics,
  type GreenfieldGenerationMetrics,
} from "./metrics.cjs";
import { auditGreenfieldMarkers } from "./promptAudit.cjs";
import { validateGreenfieldFiles } from "./validate.cjs";
import {
  parseGreenfieldResponseDetailed,
} from "./parse.cjs";
import {
  isMockProviderEnabled,
  mockGreenfieldGenerate,
} from "../providers/mockProvider.cjs";

/**
 * AI greenfield generation (Phase 10). Produces exactly seven files for a
 * minimal Vite + React + TypeScript app. No writes — proposal only until the
 * user approves and the Phase 5 writer runs.
 */

export { GREENFIELD_PATHS, type GreenfieldPath } from "./paths.cjs";
import { GREENFIELD_PATHS } from "./paths.cjs";

import type { GeneratedFilePath } from "./paths.cjs";

export interface GeneratedFile {
  path: GeneratedFilePath;
  content: string;
}

export interface GreenfieldGenerateResult {
  ok: boolean;
  provider: ProviderId;
  model: string;
  files?: GeneratedFile[];
  rawText?: string;
  error?: string;
  latencyMs: number;
  debug?: GreenfieldDebugReport;
  metrics?: GreenfieldGenerationMetrics;
  markerAudit?: import("./promptAudit.cjs").GreenfieldMarkerAudit;
}

const IMPLS = { gemini, ollama, anthropic, groq, openrouter } as const;

export { parseGreenfieldResponse, parseGreenfieldResponseDetailed } from "./parse.cjs";

const EXAMPLE_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const EXAMPLE_MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);`;

const EXAMPLE_TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts"]
}`;

const EXAMPLE_VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});`;

const EXAMPLE_PACKAGE_JSON = `{
  "name": "greenfield-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.4.5",
    "vite": "^5.3.1"
  }
}`;

export function buildGreenfieldPrompt(userPrompt: string): string {
  const orderedList = GREENFIELD_PATHS.map((p, i) => `  ${i + 1}. ${p}`).join(
    "\n",
  );
  return [
    "You are generating a brand-new minimal web application from scratch.",
    "Output ONLY the following files — no other paths, no README, no extra folders.",
    "",
    "You must output exactly 7 files.",
    "Do not stop until @@END:src/App.tsx@@ has been emitted.",
    "",
    "Generate files in this exact order (all seven are mandatory):",
    orderedList,
    "",
    "src/App.tsx is usually the largest file — keep it last so config files finish first.",
    "",
    "Stack: Vite, React 18, TypeScript (strict), plain CSS in src/index.css.",
    "Do not generate Electron configuration. This is a browser-only Vite React app.",
    "The app must be runnable with: npm install && npm run build && npm run dev.",
    "Total output will be several thousand characters — do not summarize or abbreviate file contents.",
    "",
    "package.json dependency policy (mandatory — npm install must succeed):",
    "- Use ONLY stable published versions on npm.",
    "- Do NOT use RC, beta, alpha, canary, next, or experimental versions (no -rc, -beta, etc.).",
    "- Use exactly these dependency versions:",
    "  react: ^18.3.1",
    "  react-dom: ^18.3.1",
    "  @types/react: ^18.3.3",
    "  @types/react-dom: ^18.3.0",
    "  @vitejs/plugin-react: ^5.0.0",
    "  typescript: ^5.4.5",
    "  vite: ^5.3.1",
    "- react and react-dom must share the same major version; @types/react and @types/react-dom must match that major.",
    "",
    "Use this exact format for EACH file (no markdown fences around file bodies):",
    "@@FILE:<path>@@",
    "<full file content>",
    "@@END:<path>@@",
    "",
    "Worked example (package.json — copy these versions exactly):",
    "@@FILE:package.json@@",
    EXAMPLE_PACKAGE_JSON,
    "@@END:package.json@@",
    "",
    "Worked example (index.html and src/main.tsx — follow this pattern for every file):",
    "@@FILE:index.html@@",
    EXAMPLE_INDEX_HTML,
    "@@END:index.html@@",
    "@@FILE:src/main.tsx@@",
    EXAMPLE_MAIN_TSX,
    "@@END:src/main.tsx@@",
    "",
    "Worked example (tsconfig.json — standalone, no project references):",
    "@@FILE:tsconfig.json@@",
    EXAMPLE_TSCONFIG_JSON,
    "@@END:tsconfig.json@@",
    "",
    "Worked example (vite.config.ts — no Node path imports; @types/node is not generated):",
    "@@FILE:vite.config.ts@@",
    EXAMPLE_VITE_CONFIG,
    "@@END:vite.config.ts@@",
    "",
    "Anti-early-stop: If you cannot continue, still close the current file with @@END:<path>@@ before stopping.",
    "",
    "Rules:",
    "- package.json must match the worked example versions (stable React 18 only).",
    "- package.json must include scripts: dev, build, typecheck, preview.",
    "- typecheck script: tsc -p tsconfig.json --noEmit",
    "- vite.config.ts must use defineConfig and @vitejs/plugin-react only.",
    "- vite.config.ts imports must be ONLY:",
    "    import { defineConfig } from \"vite\";",
    "    import react from \"@vitejs/plugin-react\";",
    "- vite.config.ts must NOT import or reference: vite-plugin-electron, electron, electron-builder, main, preload, nodeIntegration, or any Electron-specific plugin.",
    "- package.json must NOT list vite-plugin-electron, electron, or electron-builder in dependencies or devDependencies.",
    "- vite.config.ts must NOT import \"path\" or use __dirname (no @types/node in this project).",
    "- tsconfig.json is standalone (single file). Do NOT use \"references\" or \"extends\".",
    "- Do NOT reference tsconfig.node.json or any file outside the 7-file list.",
    "- tsconfig.json must include [\"src\", \"vite.config.ts\"], compilerOptions.jsx \"react-jsx\", strict true, noEmit true.",
    "- index.html must mount #root and load /src/main.tsx.",
    "- src/main.tsx renders App into #root.",
    "- src/App.tsx implements the user's request as a working UI (not a placeholder stub).",
    "- src/App.tsx must pass strict TypeScript: no use-before-declaration for const handlers (use function declarations or define handlers before use).",
    "- src/App.tsx must pass `npx tsc --noEmit` on first try: Array.find/filter returns T | undefined — when a prop or state type is T | null, coerce with `?? null` (never pass undefined where null is expected).",
    "- Prefer explicit null for empty selection state (useState<string | null>(null)); optional props use `prop?: T` or `prop: T | undefined`, not mixed null/undefined on the same value.",
    "- Do not reference files that are not in the list above.",
    "- Do not output prose outside the file markers.",
    "",
    "Before finishing, confirm this checklist (all must be yes):",
    "- [ ] package.json",
    "- [ ] index.html",
    "- [ ] src/main.tsx",
    "- [ ] tsconfig.json",
    "- [ ] vite.config.ts",
    "- [ ] src/index.css",
    "- [ ] src/App.tsx",
    "",
    "User request:",
    userPrompt,
  ].join("\n");
}


function attachMetricsToDebug(
  debug: GreenfieldDebugReport,
  metrics: GreenfieldGenerationMetrics,
): GreenfieldDebugReport {
  return { ...debug, metrics };
}

function providerFailureResult(
  startedAt: number,
  res: ProviderResponse,
  metrics: GreenfieldGenerationMetrics,
): GreenfieldGenerateResult {
  const error = res.error ?? "Provider request failed.";
  const debug = attachMetricsToDebug(
    buildProviderFailureDebug(startedAt, error, {
      provider: res.provider,
      model: res.model,
      latencyMs: res.latencyMs,
      raw: res.raw,
      metrics,
    }),
    metrics,
  );
  return {
    ok: false,
    provider: res.provider,
    model: res.model,
    rawText: res.text,
    latencyMs: res.latencyMs,
    error,
    debug,
    metrics,
  };
}

export async function runGreenfieldGenerate(
  provider: ProviderId,
  userPrompt: string,
): Promise<GreenfieldGenerateResult> {
  if (isMockProviderEnabled()) return mockGreenfieldGenerate(provider, userPrompt);
  const startedAt = Date.now();
  const raw = await loadRawSettings();
  const impl = IMPLS[provider];
  if (!impl) {
    const error = `Unknown provider: ${provider}`;
    return {
      ok: false,
      provider,
      model: "",
      latencyMs: 0,
      error,
      debug: {
        stage: "greenfield:generate",
        provider,
        requestStartedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        ipcChannel: "greenfield:generate",
        errorMessage: error,
      },
    };
  }

  const prompt = buildGreenfieldPrompt(userPrompt);
  const maxOutputTokens = GREENFIELD_MAX_OUTPUT_TOKENS;

  const configuredTimeoutMs = PROVIDER_TIMEOUT_MS.generateGreenfield;
  const providerStart = Date.now();
  const res = await impl.generate(raw, prompt, maxOutputTokens, {
    timeoutMs: configuredTimeoutMs,
    operation: "greenfield",
  });
  const providerWaitMs = Date.now() - providerStart;

  const parseStart = Date.now();
  const parseResult = res.ok ? parseGreenfieldResponseDetailed(res.text) : null;
  let outputFiles: GeneratedFile[] | null = parseResult?.ok
    ? ((parseResult.files ?? null) as GeneratedFile[] | null)
    : null;
  const parseMs = Date.now() - parseStart;

  const totalMs = Date.now() - startedAt;
  const metrics = buildGenerationMetrics({
    prompt,
    userPrompt,
    responseText: res.text,
    maxOutputTokens,
    providerWaitMs,
    parseMs,
    totalMs,
    provider,
    configuredTimeoutMs: res.timeoutMs ?? configuredTimeoutMs,
  });

  logGreenfieldMetrics(provider, res.model, res.ok && outputFiles !== null, metrics);

  if (!res.ok) {
    return providerFailureResult(startedAt, res, metrics);
  }

  if (outputFiles) {
    const configCheck = validateGreenfieldFiles(outputFiles);
    if (!configCheck.ok) {
      const error = configCheck.errors[0] ?? "Invalid generated configuration.";
      const debug = attachMetricsToDebug(
        buildParseFailureDebug(startedAt, {
          provider: res.provider,
          model: res.model,
          latencyMs: res.latencyMs,
          rawText: res.text,
          promptSent: prompt,
          errorMessage: error,
          extraNotes: configCheck.errors,
        }),
        metrics,
      );
      return {
        ok: false,
        provider: res.provider,
        model: res.model,
        rawText: res.text,
        latencyMs: res.latencyMs,
        error,
        debug,
        metrics,
      };
    }
    outputFiles = configCheck.files as GeneratedFile[];
  }

  if (!outputFiles) {
    const parseError =
      parseResult?.errorMessage ??
      "Greenfield parse incomplete: parsed 0/7 expected files.";
    const markerAudit = auditGreenfieldMarkers(res.text, prompt);
    console.info(
      "[greenfield:prompt-audit]",
      JSON.stringify({
        responseChars: res.text.length,
        detectedStarts: markerAudit.detectedFileStarts,
        detectedEnds: markerAudit.detectedFileEnds,
        missing: markerAudit.missingFiles,
        parsed: parseResult?.diagnostics.parsedFiles ?? [],
      }),
    );
    const debug = attachMetricsToDebug(
      buildParseFailureDebug(startedAt, {
        provider: res.provider,
        model: res.model,
        latencyMs: res.latencyMs,
        rawText: res.text,
        promptSent: prompt,
        markerAudit,
        errorMessage: parseError,
      }),
      metrics,
    );
    return {
      ok: true,
      provider: res.provider,
      model: res.model,
      rawText: res.text,
      latencyMs: res.latencyMs,
      error: parseError,
      debug,
      metrics,
      markerAudit,
      ...(parseResult?.partialFiles?.length
        ? {
            files: parseResult.partialFiles.map((f) => ({
              path: f.path,
              content: f.content,
            })),
          }
        : {}),
    };
  }

  return {
    ok: true,
    provider: res.provider,
    model: res.model,
    files: outputFiles,
    rawText: res.text,
    latencyMs: res.latencyMs,
    metrics,
  };
}
