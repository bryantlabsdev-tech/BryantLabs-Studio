import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRecoverablePartialContent,
  parseGreenfieldMultiFormat,
  parseGreenfieldWithRepair,
  recoverBestMarkerContent,
} from "@/core/greenfield/parseResponse";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import {
  PROVIDER_OUTPUT_PARSER_ZERO_MESSAGE,
  PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE,
  classifyGreenfieldParserZeroFiles,
  classifyGreenfieldProviderNoOutput,
} from "@/core/greenfield/parseErrors";

function marker(path: string, content: string): string {
  return `@@FILE:${path}@@\n${content}\n@@END:${path}@@`;
}

function minimalContent(path: string): string {
  if (path === "package.json") {
    return JSON.stringify({
      name: "app",
      scripts: { dev: "vite", build: "tsc && vite build", typecheck: "tsc", preview: "vite preview" },
      dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
      devDependencies: {
        vite: "^5.3.1",
        typescript: "^5.4.5",
        "@vitejs/plugin-react": "^5.0.0",
        "@types/react": "^18.3.3",
        "@types/react-dom": "^18.3.0",
      },
    });
  }
  if (path === "index.html") {
    return '<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>';
  }
  if (path === "src/main.tsx") {
    return 'import App from "./App"; export {};';
  }
  if (path === "src/App.tsx") {
    return "export default function App(){return <div/>}";
  }
  if (path === "tsconfig.json") {
    return '{"compilerOptions":{"jsx":"react-jsx","strict":true,"noEmit":true},"include":["src","vite.config.ts"]}';
  }
  if (path === "vite.config.ts") {
    return 'import { defineConfig } from "vite"; export default defineConfig({});';
  }
  return "body{}";
}

describe("parseGreenfieldMultiFormat", () => {
  it("parses canonical @@FILE@@ blocks", () => {
    const text = GREENFIELD_FILE_PATHS.map((p) => marker(p, minimalContent(p))).join("\n\n");
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 7);
    assert.equal(result.bestPattern, "canonical_at_file");
  });

  it("parses format A dash FILE blocks", () => {
    const text = `---FILE: src/App.tsx---
export default function App(){return <div/>}
---END FILE---`;
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.path, "src/App.tsx");
    assert.equal(result.bestPattern, "format_a_dash_file");
  });

  it("parses format B FILE: path blocks", () => {
    const text = `FILE: package.json
{"name":"app"}

FILE: src/App.tsx
export default function App(){return null}`;
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 2);
    assert.ok(result.files.some((f) => f.path === "package.json"));
    assert.ok(result.files.some((f) => f.path === "src/App.tsx"));
  });

  it("parses format C markdown file headings", () => {
    const text = `### src/App.tsx
export default function App(){return <h1>Hi</h1>}`;
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.path, "src/App.tsx");
  });

  it("parses format D code fences with file=", () => {
    const text = '```tsx file=src/App.tsx\nexport default function App(){return null}\n```';
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.path, "src/App.tsx");
  });

  it("parses format D code fences with filename=", () => {
    const text = '```json filename=package.json\n{"name":"app"}\n```';
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.path, "package.json");
  });

  it("parses format E JSON files array", () => {
    const text = JSON.stringify({
      files: [
        { path: "src/App.tsx", content: "export default function App(){return null}" },
        { path: "package.json", content: '{"name":"app"}' },
      ],
    });
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 2);
    assert.equal(result.bestPattern, "format_e_json_files");
  });

  it("parses format F path line before code fence", () => {
    const text = `src/App.tsx
\`\`\`tsx
export default function App(){return null}
\`\`\``;
    const result = parseGreenfieldMultiFormat(text);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.path, "src/App.tsx");
  });

  it("records parser patterns attempted and failure reasons on empty response", () => {
    const result = parseGreenfieldMultiFormat("");
    assert.equal(result.files.length, 0);
    assert.equal(result.responseShape, "empty");
    assert.ok(result.patternsAttempted.includes("canonical_at_file"));
    assert.match(result.failureReasons.canonical_at_file ?? "", /empty/i);
  });

  it("parseGreenfieldWithRepair exposes raw preview and length", () => {
    const text = marker("src/App.tsx", "export default function App(){return null}");
    const outcome = parseGreenfieldWithRepair(text);
    assert.equal(outcome.rawResponseLength, text.length);
    assert.ok(outcome.rawResponsePreview.includes("src/App.tsx"));
    assert.ok(outcome.patternsAttempted.length > 0);
  });

  it("recovers truncated tail App.tsx marker without @@END@@", () => {
    const otherFiles = GREENFIELD_FILE_PATHS.filter((path) => path !== "src/App.tsx").map(
      (path) => marker(path, minimalContent(path)),
    );
    const truncatedApp = `@@FILE:src/App.tsx@@
import { BrowserRouter, Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <div className="flex min-h-screen bg-slate-900 text-white">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<h1>FieldFlow</h1>} />
        </Routes>
      </BrowserRouter>
    </div>
  );
`;
    const text = `${otherFiles.join("\n\n")}\n\n${truncatedApp}`;
    const outcome = parseGreenfieldWithRepair(text);
    assert.equal(outcome.partial.length, 7);
    assert.equal(outcome.files?.length, 7);
    const app = outcome.files?.find((file) => file.path === "src/App.tsx");
    assert.ok(app);
    assert.match(app.content, /FieldFlow/);
    assert.doesNotMatch(app.content, /New app/);
    assert.ok(outcome.diagnostics.recoveredTruncatedFiles?.includes("src/App.tsx"));
  });

  it("recovers large truncated App.tsx with unbalanced braces after auto-close", () => {
    const truncatedApp = `@@FILE:src/App.tsx@@
import { useState } from "react";

export default function App() {
  const [page, setPage] = useState("dashboard");
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">FieldFlow</div>
      </aside>
      <div className="main-content">
        <header className="header">
          <input className="search-input" placeholder="Search" />
        </header>
        <section className="page-content">
          <h1>{page}</h1>
          <div className="kpi-grid">
            <div className="kpi-card"><span>New Leads</span><strong>12</strong></div>
            <div className="kpi-card"><span>Active Jobs</span><strong>8</strong></div>
`;
    const recovered = recoverBestMarkerContent(truncatedApp, "src/App.tsx");
    assert.ok(recovered);
    assert.match(recovered!, /FieldFlow/);
    assert.match(recovered!, /export default function App/);
    assert.ok(isRecoverablePartialContent("src/App.tsx", recovered!));
  });
});

describe("greenfield error classification", () => {
  it("provider degraded with no backup shows exact error", () => {
    const msg = classifyGreenfieldProviderNoOutput(
      "gemini is temporarily degraded. Using backup if available.",
      false,
      false,
    );
    assert.equal(msg, `${PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE} No backup provider configured.`);
  });

  it("provider returned text but parser found 0 files shows exact error", () => {
    assert.equal(
      classifyGreenfieldParserZeroFiles(1200),
      PROVIDER_OUTPUT_PARSER_ZERO_MESSAGE,
    );
  });
});
