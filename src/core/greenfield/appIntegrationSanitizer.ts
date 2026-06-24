/** Normalize generated App.tsx — main.tsx already wraps BrowserRouter. */
export function sanitizeAppIntegration(content: string): string {
  let out = content;

  out = out.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]react-router-dom['"];?\s*\n/g,
    (_match, imports: string) => {
      const names = imports
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((part) => {
          const bare = part.replace(/\s+as\s+\w+$/i, "").trim();
          return bare !== "BrowserRouter";
        });
      if (names.length === 0) return "";
      return `import { ${names.join(", ")} } from "react-router-dom";\n`;
    },
  );

  out = out.replace(/^\s*import\s*\{\s*BrowserRouter\s*\}\s*from\s*['"]react-router-dom['"];?\s*\n/gm, "");
  out = out.replace(/<BrowserRouter>\s*/g, "");
  out = out.replace(/<\/BrowserRouter>\s*/g, "");
  out = out.replace(/<Router>\s*/g, "");
  out = out.replace(/<\/Router>\s*/g, "");

  out = out.replace(
    /import\s+Layout\s+from\s+(['"]\.\/components\/Layout['"]);?/g,
    'import { Layout } from "./components/Layout";',
  );

  out = out.replace(
    /import\s+Sidebar\s+from\s+(['"]\.\/Sidebar['"]);?/g,
    'import { Sidebar } from "./Sidebar";',
  );

  return out;
}
