import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runMultiPhaseGreenfieldGenerate } from "@/core/greenfield/multiPhasePipeline";
import type { GreenfieldGenerateReliabilityHost } from "@/core/greenfield/generatePipeline";
import type { ProviderSettings } from "@/core/providers/types";

function marker(path: string, content: string): string {
  return `@@FILE:${path}@@\n${content}\n@@END:${path}@@`;
}

async function mockSettings(): Promise<ProviderSettings> {
  const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.0-flash",
    hasGeminiKey: true,
    hasAnthropicKey: false,
    hasGroqKey: false,
    hasOpenRouterKey: false,
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-6",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "anthropic/claude-sonnet-4",
  } as ProviderSettings);
}

describe("multiPhasePipeline", () => {
  it("merges phased responses and fails closed without real App wiring", async () => {
    const calls: string[] = [];
    const settings = await mockSettings();
    const host: GreenfieldGenerateReliabilityHost = {
      api: {
        greenfieldGenerateRaw: async (_p: string, prompt: string) => {
          calls.push(prompt.slice(0, 40));
          if (prompt.includes("shared foundation")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: [
                marker("src/types.ts", "export type Lead = { id: string };"),
                marker("src/components/Layout.tsx", "export default function Layout(){ return <div/>; }"),
                marker("src/components/Sidebar.tsx", "export default function Sidebar(){ return <nav/>; }"),
                marker("src/hooks/useLocalStorage.ts", "export function useLocalStorage<T>(k:string,i:T){ return [i,()=>{}] as const; }"),
              ].join("\n"),
            };
          }
          if (prompt.includes("Generate page components (batch")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: [
                marker(
                  "src/pages/Dashboard.tsx",
                  "export default function Dashboard(){ return <div>Dash</div>; }",
                ),
                marker(
                  "src/pages/Leads.tsx",
                  "export default function Leads(){ return <div>Leads</div>; }",
                ),
              ].join("\n"),
            };
          }
          return {
            ok: true,
            provider: "gemini",
            model: "m",
            latencyMs: 1,
            rawText: marker("src/App.tsx", "export default function App(){ return <div>stub</div>; }"),
          };
        },
      } as never,
      settings,
      invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      invokeGreenfieldRawCall: async (_s, _t, call) => call("gemini") as never,
      canMakeAiCall: () => ({ ok: true }),
    };

    const result = await runMultiPhaseGreenfieldGenerate(
      host,
      "FieldFlow CRM Tailwind Router Lucide localStorage\n1. Dashboard\n2. Leads",
    );

    assert.ok(calls.length >= 3);
    assert.equal(result.generationMode, "multi-phase");
    assert.equal(result.ok, false);
    assert.equal(result.appShellIncomplete, true);
    assert.match(result.error ?? "", /App\.tsx|placeholder|incomplete|Missing page/i);
  });

  it("succeeds when App integrates routes and layout", async () => {
    const settings = await mockSettings();
    const userPrompt = `FieldFlow CRM Tailwind Router Lucide
Pages:
1. Dashboard
2. Leads

Requirements:
- KPI cards`;
    const host: GreenfieldGenerateReliabilityHost = {
      api: {
        greenfieldGenerateRaw: async (_p: string, prompt: string) => {
          if (prompt.includes("shared foundation")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: [
                marker("src/types.ts", "export type X = { id: string };"),
                marker("src/components/Layout.tsx", "export default function Layout({children}:{children:React.ReactNode}){ return <div>{children}</div>; }"),
                marker("src/components/Sidebar.tsx", "export default function Sidebar(){ return <nav/>; }"),
              ].join("\n"),
            };
          }
          if (prompt.includes("Generate page components (batch")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: [
                marker(
                  "src/pages/Dashboard.tsx",
                  "export default function Dashboard(){ return <div>Dash</div>; }",
                ),
                marker(
                  "src/pages/Leads.tsx",
                  "export default function Leads(){ return <div>Leads</div>; }",
                ),
              ].join("\n"),
            };
          }
          return {
            ok: true,
            provider: "gemini",
            model: "m",
            latencyMs: 1,
            rawText: marker(
              "src/App.tsx",
              `import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
export default function App(){
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
      </Routes>
    </Layout>
  );
}`,
            ),
          };
        },
      } as never,
      settings,
      invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      invokeGreenfieldRawCall: async (_s, _t, call) => call("gemini") as never,
      canMakeAiCall: () => ({ ok: true }),
    };

    const result = await runMultiPhaseGreenfieldGenerate(host, userPrompt);

    assert.equal(result.ok, true);
    assert.ok(result.projectFiles?.some((f) => f.path === "src/pages/Dashboard.tsx"));
    assert.ok(result.projectFiles?.some((f) => f.path === "src/App.tsx"));
    assert.equal(result.generationMode, "multi-phase");
  });

  it("fills stub pages when pages phase is incomplete (A10 regression)", async () => {
    const fieldFlowPrompt = `Create FieldFlow CRM
Pages:
1. Dashboard
2. Leads
3. Jobs
4. Estimates
5. Invoices
6. Customers
7. Settings

Requirements:
- CRUD leads`;

    const settings = await mockSettings();
    const host: GreenfieldGenerateReliabilityHost = {
      api: {
        greenfieldGenerateRaw: async (_p: string, prompt: string) => {
          if (prompt.includes("shared foundation")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: [
                marker("src/types.ts", "export type Lead = { id: string };"),
                marker("src/components/Layout.tsx", "export default function Layout({children}:{children:React.ReactNode}){ return <div>{children}</div>; }"),
                marker("src/components/Sidebar.tsx", "export default function Sidebar(){ return <nav/>; }"),
                marker("src/hooks/useLocalStorage.ts", "export function useLocalStorage<T>(k:string,i:T){ return [i,()=>{}] as const; }"),
              ].join("\n"),
            };
          }
          if (prompt.includes("Generate page components (batch")) {
            const parts: string[] = [];
            if (prompt.includes("src/pages/Dashboard.tsx")) {
              parts.push(
                marker(
                  "src/pages/Dashboard.tsx",
                  "export default function Dashboard(){ return <div>Dash</div>; }",
                ),
              );
            }
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: parts.join("\n"),
            };
          }
          return {
            ok: true,
            provider: "gemini",
            model: "m",
            latencyMs: 1,
            rawText: marker(
              "src/App.tsx",
              `import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
export default function App(){
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
      </Routes>
    </Layout>
  );
}`,
            ),
          };
        },
      } as never,
      settings,
      invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      invokeGreenfieldRawCall: async (_s, _t, call) => call("gemini") as never,
      canMakeAiCall: () => ({ ok: true }),
    };

    const result = await runMultiPhaseGreenfieldGenerate(host, fieldFlowPrompt);

    assert.equal(result.ok, true);
    assert.ok(result.stubbedPagePaths?.includes("src/pages/Leads.tsx"));
    assert.ok(result.projectFiles?.some((f) => f.path === "src/pages/Leads.tsx"));
    assert.ok(result.warnings?.some((w) => w.includes("Stub pages generated")));
  });

  it("fills deterministic App when app phase is budget-blocked", async () => {
    const settings = await mockSettings();
    let callCount = 0;
    const userPrompt = `FieldFlow React Router
Pages:
1. Dashboard
2. Leads`;
    const host: GreenfieldGenerateReliabilityHost = {
      api: {
        greenfieldGenerateRaw: async (_p: string, prompt: string) => {
          callCount += 1;
          if (prompt.includes("Generate src/App.tsx") || prompt.includes("application router")) {
            return { ok: false, provider: "gemini", model: "m", latencyMs: 1, error: "blocked" };
          }
          if (prompt.includes("shared foundation")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: [
                marker("src/types.ts", "export type Lead = { id: string };"),
                marker("src/components/Layout.tsx", "export function Layout({children}:{children:React.ReactNode}){return <div>{children}</div>;}"),
              ].join("\n"),
            };
          }
          if (prompt.includes("Generate page components (batch")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              rawText: marker("src/pages/Dashboard.tsx", "export default function Dashboard(){return <div/>;}"),
            };
          }
        },
      } as never,
      settings,
      invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      invokeGreenfieldRawCall: async (_s, _t, call) => call("gemini") as never,
      canMakeAiCall: () => ({ ok: true }),
    };

    const result = await runMultiPhaseGreenfieldGenerate(host, userPrompt);
    assert.equal(result.ok, true);
    assert.ok(result.projectFiles?.some((f) => f.path === "src/App.tsx" && /Routes/.test(f.content)));
    assert.ok(result.warnings?.some((w) => w.includes("Deterministic App.tsx")));
  });

  it("accepts provider text field when rawText is omitted", async () => {
    const settings = await mockSettings();
    const host: GreenfieldGenerateReliabilityHost = {
      api: {
        greenfieldGenerateRaw: async (_p: string, prompt: string) => {
          if (prompt.includes("shared foundation")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              text: [
                marker("src/types.ts", "export type Lead = { id: string };"),
                marker(
                  "src/components/Layout.tsx",
                  "export function Layout({children}:{children:React.ReactNode}){return <div>{children}</div>;}",
                ),
              ].join("\n"),
            };
          }
          if (prompt.includes("Generate page components (batch")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              text: marker("src/pages/Dashboard.tsx", "export default function Dashboard(){return <div/>;}"),
            };
          }
          if (prompt.includes("Generate src/App.tsx") || prompt.includes("application router")) {
            return {
              ok: true,
              provider: "gemini",
              model: "m",
              latencyMs: 1,
              text: marker(
                "src/App.tsx",
                `import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
export default function App(){return <Routes><Route path="/" element={<Layout/>}><Route index element={<Dashboard/>}/></Route></Routes>;}`,
              ),
            };
          }
          return { ok: false, provider: "gemini", model: "m", latencyMs: 1, error: "unexpected" };
        },
      } as never,
      settings,
      invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      invokeGreenfieldRawCall: async (_s, _t, call) => call("gemini") as never,
      canMakeAiCall: () => ({ ok: true }),
    };

    const result = await runMultiPhaseGreenfieldGenerate(
      host,
      `FieldFlow SaaS\nPages:\n1. Dashboard\n2. Leads`,
    );
    assert.equal(result.ok, true);
    assert.ok(
      result.projectFiles?.some(
        (f) => f.path === "src/types.ts" && f.content.includes("Lead"),
      ),
    );
    assert.ok(result.projectFiles?.some((f) => f.path === "src/pages/Dashboard.tsx"));
  });
});
