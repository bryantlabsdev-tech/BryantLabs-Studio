import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";

const MARKER_RULES = [
  "Output ONLY @@FILE:path@@ … @@END:path@@ blocks. No prose outside markers.",
  "Use the exact path given for each file.",
  "TypeScript strict — no unused locals. Export components used by other files.",
  "Do not reference files outside the requested list.",
].join("\n");

const ICON_RULES = [
  "Icons: import named icons from the project IconStub module (e.g. import { Truck } from \"../components/IconStub\").",
  "NEVER import lucide-react, @heroicons/react, or react-icons — they are not installed.",
].join("\n");

const MOCK_DATA_RULES = [
  "Mock arrays: every object literal must be syntactically complete.",
  "Never truncate rows with ... or leave braces unclosed.",
  "Each mock entry must include all required fields with valid values on complete lines.",
].join("\n");

const EXPORT_RULES = [
  "Layout.tsx and Sidebar.tsx: use named exports — export function Layout / export function Sidebar (NOT default export).",
  "Page files under src/pages/: default export matching the file name (e.g. export default function Dashboard).",
].join("\n");

function existingSummary(files: readonly GreenfieldProjectFile[], maxChars = 4000): string {
  if (files.length === 0) return "(none yet)";
  return files
    .slice(-8)
    .map((f) => `@@FILE:${f.path}@@\n${f.content.slice(0, 500)}\n@@END:${f.path}@@`)
    .join("\n\n")
    .slice(0, maxChars);
}

function manifestDomainSummary(manifest: GreenfieldManifest): string {
  const entities = manifest.pages
    .map((p) => p.title)
    .filter((t) => !/^dashboard$/i.test(t))
    .join(", ");
  return entities || manifest.appName;
}

function manifestPageNavList(manifest: GreenfieldManifest): string {
  return manifest.pages.map((p) => `${p.title} (${p.route})`).join(", ");
}

export function buildSharedPhasePrompt(
  userPrompt: string,
  manifest: GreenfieldManifest,
  existing: readonly GreenfieldProjectFile[],
): string {
  const paths = manifest.sharedPaths.join(", ");
  const stack = [
    manifest.useTailwind ? "Tailwind CSS" : "plain CSS in src/index.css",
    manifest.useRouter ? "React Router v6" : "no router",
    "local IconStub icons (src/components/IconStub.tsx — already on disk)",
    manifest.useLocalStorage ? "localStorage persistence hook" : "",
  ]
    .filter(Boolean)
    .join(", ");

  return [
    "Generate the shared foundation for a new React + TypeScript + Vite app.",
    `App name: ${manifest.appName}`,
    `Stack: ${stack}`,
    "",
    "Generate ONLY these files:",
    paths,
    "",
    "Requirements:",
    `- src/types.ts: domain types and status unions for ${manifest.appName} — entities: ${manifestDomainSummary(manifest)}. Do NOT use unrelated CRM types (Lead, Job, Invoice) unless they appear in the user request.`,
    manifest.useLocalStorage
      ? "- src/hooks/useLocalStorage.ts: typed localStorage hook"
      : "",
    "- src/components/Layout.tsx: shell with sidebar slot and top bar area; sidebar as <aside> min-w-[200px]; main content min-h-[60vh]",
    `- src/components/Sidebar.tsx: nav links ONLY for these pages: ${manifestPageNavList(manifest)}`,
    ICON_RULES,
    EXPORT_RULES,
    MOCK_DATA_RULES,
    manifest.useTailwind
      ? '- Use Tailwind; KPI/summary areas should use className="panel-card" (defined in index.css)'
      : "",
    MARKER_RULES,
    "",
    "Bootstrap already on disk (do not regenerate):",
    existingSummary(existing),
    "",
    "User request:",
    userPrompt,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPagesBatchPhasePrompt(
  userPrompt: string,
  batchManifest: GreenfieldManifest,
  fullManifest: GreenfieldManifest,
  existing: readonly GreenfieldProjectFile[],
  batchIndex: number,
  batchCount: number,
): string {
  const pageList = batchManifest.pages
    .map((p) => `- ${p.path} — route ${p.route} — ${p.title}`)
    .join("\n");
  const otherPages = fullManifest.pages
    .filter((p) => !batchManifest.pagePaths.includes(p.path))
    .map((p) => p.title)
    .join(", ");

  return [
    `Generate page components (batch ${batchIndex} of ${batchCount}) for a React + TypeScript SaaS app.`,
    `App: ${fullManifest.appName}`,
    fullManifest.useTailwind ? "Use Tailwind CSS classes." : "Use CSS classes matching the dark theme.",
    fullManifest.useTailwind
      ? 'Use className="panel-card" on KPI cards, stat tiles, and content sections (min visible size).'
      : "",
    ICON_RULES,
    MOCK_DATA_RULES,
    "",
    `You MUST output exactly ${batchManifest.pagePaths.length} page file(s) in this batch (one @@FILE block each):`,
    pageList,
    otherPages ? `(Other pages ${otherPages} are generated in other batches — do not output them here.)` : "",
    "",
    "Each page must:",
    "- default export a React component named like the file (e.g. Dashboard for Dashboard.tsx)",
    "- Import shared types from ../types — use types that match THIS app's domain (${manifestDomainSummary(manifest)})",
    "- Include mock table or card data where appropriate",
    "- Support empty states",
    "- Use status badges where the user prompt mentions statuses",
    "- Keep each file focused and under ~150 lines",
    "- Avoid duplicating layout (Layout handles chrome)",
    '- Import React hooks explicitly: import { useState } from "react" — never default import React',
    batchManifest.pages.some((p) => /dashboard/i.test(p.title))
      ? "- Dashboard: render at least 3 KPI panel-card tiles in a responsive grid"
      : "",
    MARKER_RULES,
    "",
    "Existing project files (for import paths):",
    existingSummary(existing),
    "",
    "User request:",
    userPrompt,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPagesPhasePrompt(
  userPrompt: string,
  manifest: GreenfieldManifest,
  existing: readonly GreenfieldProjectFile[],
): string {
  const pageList = manifest.pages
    .map((p) => `- ${p.path} — route ${p.route} — ${p.title}`)
    .join("\n");

  return [
    "Generate ALL page components for a React + TypeScript SaaS app.",
    `App: ${manifest.appName}`,
    manifest.useTailwind ? "Use Tailwind CSS classes." : "Use CSS classes matching the dark theme.",
    ICON_RULES,
    MOCK_DATA_RULES,
    "",
    `You MUST output exactly ${manifest.pagePaths.length} page files (one @@FILE block each):`,
    pageList,
    "",
    "Each page must:",
    "- default export a React component named like the file (e.g. Dashboard for Dashboard.tsx)",
    "- Import shared types from ../types — use types that match THIS app's domain (${manifestDomainSummary(manifest)})",
    "- Include mock table or card data where appropriate",
    "- Support empty states",
    "- Use status badges where the user prompt mentions statuses",
    "- Keep each file focused and under ~120 lines — prioritize completing ALL listed files",
    "- Avoid duplicating layout (Layout handles chrome)",
    MARKER_RULES,
    "",
    "Existing project files (for import paths):",
    existingSummary(existing),
    "",
    "User request:",
    userPrompt,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAppIntegrationPrompt(
  userPrompt: string,
  manifest: GreenfieldManifest,
  existing: readonly GreenfieldProjectFile[],
): string {
  const readyPages = manifest.pages.filter((p) =>
    existing.some((f) => f.path === p.path && f.content.trim()),
  );
  const pages = readyPages.length > 0 ? readyPages : manifest.pages;
  const routes = pages
    .map((p) => {
      const comp = p.title.replace(/\s+/g, "");
      return `  <Route path="${p.route}" element={<${comp} />} />`;
    })
    .join("\n");
  const imports = pages
    .map((p) => {
      const comp = p.title.replace(/\s+/g, "");
      return `import ${comp} from "./pages/${comp}";`;
    })
    .join("\n");

  return [
    "Generate src/App.tsx — the application router and provider wiring ONLY.",
    `App: ${manifest.appName}`,
    "",
    "Generate ONLY:",
    "src/App.tsx",
    "",
    "Must:",
    "- Import Layout from ./components/Layout (named export: { Layout })",
    "- Import all page components",
    manifest.useRouter
      ? "- Use Routes/Route from react-router-dom with Layout as parent route and <Outlet /> in Layout"
      : "- Render Dashboard as default view",
    manifest.useRouter
      ? "- Do NOT import or wrap in BrowserRouter — src/main.tsx already provides it"
      : "",
    "- Use nested routes: <Route path=\"/\" element={<Layout />}> with index + child paths",
    "- Wire a simple in-memory or localStorage-backed context if the user requested persistence",
    "- Export default function App",
    "",
    "Suggested routes:",
    routes || "(single page)",
    "",
    "Suggested imports:",
    imports || "(see existing pages)",
    MARKER_RULES,
    "",
    "Existing files:",
    existingSummary(existing, 6000),
    "",
    "User request:",
    userPrompt,
  ].join("\n");
}

export function buildSingleFileRetryPrompt(
  userPrompt: string,
  targetPath: string,
  existing: readonly GreenfieldProjectFile[],
  errorHint?: string,
): string {
  return [
    `Regenerate ONLY ${targetPath} for the React app.`,
    errorHint ? `Previous attempt issue: ${errorHint}` : "",
    MARKER_RULES,
    "",
    "Existing project:",
    existingSummary(existing, 5000),
    "",
    "User request:",
    userPrompt,
  ]
    .filter(Boolean)
    .join("\n");
}
