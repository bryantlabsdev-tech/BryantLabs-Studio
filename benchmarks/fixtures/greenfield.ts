import { GREENFIELD_FILE_PATHS, type GeneratedFile } from "@/core/greenfield/types";

export function marker(path: string, content: string): string {
  return `@@FILE:${path}@@\n${content}\n@@END:${path}@@`;
}

export function allSevenFiles(): GeneratedFile[] {
  return GREENFIELD_FILE_PATHS.map((path) => ({
    path,
    content:
      path === "package.json"
        ? JSON.stringify({
            name: "app",
            scripts: {
              dev: "vite",
              build: "tsc && vite build",
              typecheck: "tsc",
              preview: "vite preview",
            },
            dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
            devDependencies: {
              vite: "^5.3.1",
              typescript: "^5.4.5",
              "@vitejs/plugin-react": "^5.0.0",
              "@types/react": "^18.3.3",
              "@types/react-dom": "^18.3.0",
            },
          })
        : path === "index.html"
          ? '<div id="root"></div><script type="module" src="/src/main.tsx"></script>'
          : path === "src/main.tsx"
            ? 'import App from "./App"; createRoot(document.getElementById("root")!).render(<App />);'
            : path === "src/App.tsx"
              ? "export default function App(){return <div/>}"
              : path === "tsconfig.json"
                ? '{"compilerOptions":{"jsx":"react-jsx","strict":true,"noEmit":true},"include":["src","vite.config.ts"]}'
                : path === "vite.config.ts"
                  ? 'import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({ plugins: [react()] });'
                  : "body{}",
  }));
}

export function rawFromFiles(files: readonly GeneratedFile[]): string {
  return files.map((f) => marker(f.path, f.content)).join("\n\n");
}
