import { createHash } from "node:crypto";
import { STRESS_PROMPTS } from "../prompts";
import type { StressPromptDefinition } from "../types";
import { pageComponentName, pageRouteId, pagesForPrompt } from "./parsePromptPages";
import {
  SCAFFOLD_GENERATOR_VERSION,
  SCAFFOLD_SPECIFICATIONS,
  SCAFFOLD_TOOLCHAIN,
} from "./toolchain";

export interface ScaffoldFileMap {
  readonly [relativePath: string]: string;
}

export interface ScaffoldProject {
  readonly id: string;
  readonly name: string;
  readonly appName: string;
  readonly pages: readonly string[];
  readonly files: ScaffoldFileMap;
}

function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Utf8(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function packageJson(id: string): string {
  return jsonFile({
    name: id,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -p tsconfig.json --noEmit && vite build",
      typecheck: "tsc -p tsconfig.json --noEmit",
      preview: "vite preview",
    },
    dependencies: {
      react: SCAFFOLD_TOOLCHAIN.react,
      "react-dom": SCAFFOLD_TOOLCHAIN.reactDom,
    },
    devDependencies: {
      "@types/react": SCAFFOLD_TOOLCHAIN.typesReact,
      "@types/react-dom": SCAFFOLD_TOOLCHAIN.typesReactDom,
      "@vitejs/plugin-react": SCAFFOLD_TOOLCHAIN.vitePluginReact,
      typescript: SCAFFOLD_TOOLCHAIN.typescript,
      vite: SCAFFOLD_TOOLCHAIN.vite,
    },
  });
}

function tsconfigJson(): string {
  return jsonFile({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      isolatedModules: true,
    },
    include: ["src", "vite.config.ts"],
  });
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;
}

function indexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function mainTsx(): string {
  return `/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const mount = document.getElementById("root");
if (!mount) {
  throw new Error("Missing #root");
}

createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

function viteEnv(): string {
  return `/// <reference types="vite/client" />
`;
}

function indexCss(): string {
  return `:root {
  font-family: system-ui, sans-serif;
  line-height: 1.4;
}

main {
  margin: 1.5rem auto;
  max-width: 56rem;
  padding: 0 1rem;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 1rem 0;
}
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pageModule(
  prompt: StressPromptDefinition,
  title: string,
): string {
  const component = pageComponentName(title);
  const keywords = prompt.expectedKeywords.join(", ");
  return `export function ${component}() {
  return (
    <section>
      <h2>${escapeHtml(title)}</h2>
      <p>
        ${escapeHtml(prompt.appName)} scaffold page for ${escapeHtml(title.toLowerCase())}.
      </p>
      <p>Required keywords: ${escapeHtml(keywords)}.</p>
    </section>
  );
}
`;
}

function appModule(prompt: StressPromptDefinition, pages: readonly string[]): string {
  const imports = pages
    .map((title) => {
      const component = pageComponentName(title);
      return `import { ${component} } from "./pages/${component}";`;
    })
    .join("\n");
  const entries = pages
    .map((title) => {
      const component = pageComponentName(title);
      const id = pageRouteId(title);
      return `  { id: "${id}", title: ${JSON.stringify(title)}, Page: ${component} },`;
    })
    .join("\n");
  return `import { useEffect, useState } from "react";
${imports}

const PAGES = [
${entries}
] as const;

type PageId = (typeof PAGES)[number]["id"];

export default function App() {
  const [route, setRoute] = useState<PageId>(PAGES[0].id);

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.replace(/^#\\/?/, "");
      const match = PAGES.find((page) => page.id === hash);
      setRoute(match?.id ?? PAGES[0].id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const current = PAGES.find((page) => page.id === route) ?? PAGES[0];
  const Page = current.Page;

  return (
    <main>
      <h1>${escapeHtml(prompt.name)}</h1>
      <p>${escapeHtml(prompt.appName)} deterministic stress scaffold.</p>
      <nav>
        {PAGES.map((page) => (
          <a href={"#/" + page.id} key={page.id}>
            {page.title}
          </a>
        ))}
      </nav>
      <Page />
    </main>
  );
}
`;
}

export function generateStressScaffoldProject(
  prompt: StressPromptDefinition,
): ScaffoldProject {
  const pages = pagesForPrompt(prompt);
  if (pages.length < prompt.minPages) {
    throw new Error(
      `${prompt.id} listed ${pages.length} pages but minPages is ${prompt.minPages}`,
    );
  }
  const files: Record<string, string> = {
    "package.json": packageJson(prompt.id),
    "index.html": indexHtml(prompt.name),
    "tsconfig.json": tsconfigJson(),
    "vite.config.ts": viteConfig(),
    "src/vite-env.d.ts": viteEnv(),
    "src/main.tsx": mainTsx(),
    "src/index.css": indexCss(),
    "src/App.tsx": appModule(prompt, pages),
  };
  for (const title of pages) {
    files[`src/pages/${pageComponentName(title)}.tsx`] = pageModule(prompt, title);
  }
  return {
    id: prompt.id,
    name: prompt.name,
    appName: prompt.appName,
    pages,
    files,
  };
}

export function generateAllStressScaffoldProjects(
  prompts: readonly StressPromptDefinition[] = STRESS_PROMPTS,
): readonly ScaffoldProject[] {
  return prompts.map((prompt) => generateStressScaffoldProject(prompt));
}

export function hashScaffoldFiles(files: ScaffoldFileMap): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const path of Object.keys(files).sort()) {
    hashes[path] = sha256Utf8(files[path]!);
  }
  return hashes;
}

export function projectBytesFingerprint(files: ScaffoldFileMap): string {
  const hash = createHash("sha256");
  for (const path of Object.keys(files).sort()) {
    hash.update(path, "utf8");
    hash.update("\0", "utf8");
    hash.update(files[path]!, "utf8");
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

export interface ScaffoldManifestInput {
  readonly generatedAt: string;
  readonly operator: string;
  readonly tool: string;
  readonly model: string;
  readonly outputRoot: string;
  readonly projects: readonly ScaffoldProject[];
}

export function buildScaffoldManifest(input: ScaffoldManifestInput): string {
  const projects = input.projects.map((project) => ({
    id: project.id,
    name: project.name,
    pageCount: project.pages.length,
    pages: [...project.pages],
    files: hashScaffoldFiles(project.files),
    contentSha256: projectBytesFingerprint(project.files),
  }));
  return jsonFile({
    generatorVersion: SCAFFOLD_GENERATOR_VERSION,
    generatedAt: input.generatedAt,
    operator: input.operator,
    tool: input.tool,
    model: input.model,
    specifications: [...SCAFFOLD_SPECIFICATIONS],
    outputRoot: input.outputRoot,
    projects,
  });
}

export { sha256Utf8 };
