import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";
import { buildIconStubModule } from "@/core/typescript/iconLibraryRepair";

function packageJson(manifest: GreenfieldManifest): string {
  const deps: Record<string, string> = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  };
  const devDeps: Record<string, string> = {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^5.0.0",
    typescript: "^5.4.5",
    vite: "^5.3.1",
  };

  if (manifest.useRouter) {
    deps["react-router-dom"] = "^6.24.1";
    devDeps["@types/react-router-dom"] = "^5.3.3";
  }
  // Icons use local IconStub — never add lucide-react / heroicons to generated apps.
  if (manifest.useTailwind) {
    devDeps.tailwindcss = "^3.4.4";
    devDeps.postcss = "^8.4.38";
    devDeps.autoprefixer = "^10.4.19";
  }

  return JSON.stringify(
    {
      name: manifest.appName.toLowerCase().replace(/\s+/g, "-"),
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -p tsconfig.json && vite build",
        typecheck: "tsc -p tsconfig.json --noEmit",
        preview: "vite preview",
      },
      dependencies: deps,
      devDependencies: devDeps,
    },
    null,
    2,
  );
}

function indexHtml(appName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

function mainTsx(manifest: GreenfieldManifest): string {
  if (manifest.useRouter) {
    return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);`;
  }
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);`;
}

const TSCONFIG = `{
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

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});`;

function indexCss(manifest: GreenfieldManifest): string {
  if (manifest.useTailwind) {
    return `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-900 text-gray-100 antialiased;
}

@layer components {
  .panel-card {
    @apply rounded-lg border border-gray-700 bg-gray-800 p-4 min-h-[80px] min-w-[120px];
  }
}

/* ui-audit:dashboard-layout — ensures KPI tiles measure on first preview paint */
.panel-card,
.panel,
.card,
.widget,
.dashboard-panel,
[class*="rounded-lg"][class*="border"],
main [class*="grid"] > div {
  min-width: 120px;
  min-height: 80px;
  display: block;
}
`;
  }
  return `* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0f1419;
  color: #e6edf3;
}
`;
}

function tailwindConfig(): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};`;
}

function postcssConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;
}

/** Deterministic bootstrap — no LLM call. */
export function buildBootstrapFiles(manifest: GreenfieldManifest): GreenfieldProjectFile[] {
  const iconStub = buildIconStubModule([
    "Menu",
    "Home",
    "Settings",
    "Plus",
    "Search",
    "Users",
    "Calendar",
    "FileText",
    "Truck",
    "BarChart3",
  ]);

  const files: GreenfieldProjectFile[] = [
    { path: "package.json", content: packageJson(manifest) },
    { path: "index.html", content: indexHtml(manifest.appName) },
    { path: "src/main.tsx", content: mainTsx(manifest) },
    { path: "tsconfig.json", content: TSCONFIG },
    { path: "vite.config.ts", content: VITE_CONFIG },
    { path: "src/index.css", content: indexCss(manifest) },
    { path: "src/components/IconStub.tsx", content: iconStub },
  ];
  if (manifest.useTailwind) {
    files.push(
      { path: "tailwind.config.js", content: tailwindConfig() },
      { path: "postcss.config.js", content: postcssConfig() },
    );
  }
  return files;
}
