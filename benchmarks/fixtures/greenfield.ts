import { GREENFIELD_FILE_PATHS, type GeneratedFile } from "@/core/greenfield/types";

const PACKAGE_JSON = `{
  "name": "independently-authored-greenfield-fixture",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview --port 4173"
  },
  "dependencies": {
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.2",
    "typescript": "^6.0.3",
    "vite": "^8.0.16"
  }
}
`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Independently authored greenfield fixture</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const MAIN_TSX = `import { StrictMode } from "react";
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

const APP_TSX = `import { useState } from "react";

export default function App() {
  const [notes, setNotes] = useState<string[]>(["Welcome note"]);
  const [draft, setDraft] = useState("");

  return (
    <main>
      <h1>Note tray</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setNotes((current) => [...current, text]);
          setDraft("");
        }}
      >
        <label>
          New note
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="New note"
          />
        </label>
        <button type="submit">Save note</button>
      </form>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </main>
  );
}
`;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "vite.config.ts"]
}
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
`;

const INDEX_CSS = `:root {
  color-scheme: light;
  font-family: Georgia, "Times New Roman", serif;
}

main {
  max-width: 40rem;
  margin: 2rem auto;
  padding: 1rem;
}

input {
  display: block;
  width: 100%;
  margin: 0.5rem 0 1rem;
}
`;

const BY_PATH: Record<(typeof GREENFIELD_FILE_PATHS)[number], string> = {
  "package.json": PACKAGE_JSON,
  "index.html": INDEX_HTML,
  "src/main.tsx": MAIN_TSX,
  "tsconfig.json": TSCONFIG_JSON,
  "vite.config.ts": VITE_CONFIG,
  "src/index.css": INDEX_CSS,
  "src/App.tsx": APP_TSX,
};

export function marker(path: string, content: string): string {
  return `@@FILE:${path}@@\n${content}\n@@END:${path}@@`;
}

export function allSevenFiles(): GeneratedFile[] {
  return GREENFIELD_FILE_PATHS.map((path) => ({
    path,
    content: BY_PATH[path],
  }));
}

export function rawFromFiles(files: readonly GeneratedFile[]): string {
  return files.map((file) => marker(file.path, file.content)).join("\n\n");
}
