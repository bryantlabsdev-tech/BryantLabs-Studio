import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";
import { sanitizeAppIntegration } from "@/core/greenfield/appIntegrationSanitizer";

function componentName(title: string): string {
  return title.replace(/\s+/g, "");
}

/** Deterministic router shell when the app integration phase cannot run. */
export function buildDeterministicAppFromManifest(
  manifest: GreenfieldManifest,
  projectFiles: readonly GreenfieldProjectFile[],
): GreenfieldProjectFile {
  const pages = manifest.pages.filter((p) =>
    projectFiles.some((f) => f.path === p.path && f.content.trim()),
  );
  const imports = pages
    .map((p) => {
      const comp = componentName(p.title);
      return `import ${comp} from "./pages/${comp}";`;
    })
    .join("\n");

  const routerImports = manifest.useRouter
    ? `import { Routes, Route } from "react-router-dom";\n`
    : "";
  const layoutImport = `import { Layout } from "./components/Layout";\n`;

  function nestedRoutePath(route: string): string {
    if (route === "/") return "index";
    return route.replace(/^\//, "");
  }

  const nestedRoutes = pages
    .map((p) => {
      const comp = componentName(p.title);
      const pathAttr = nestedRoutePath(p.route);
      if (pathAttr === "index") {
        return `          <Route index element={<${comp} />} />`;
      }
      return `          <Route path="${pathAttr}" element={<${comp} />} />`;
    })
    .join("\n");

  const body = manifest.useRouter
    ? `  return (
    <Routes>
      <Route path="/" element={<Layout />}>
${nestedRoutes || "          {/* no pages */}"}
      </Route>
    </Routes>
  );`
    : pages.length > 0
      ? `  const Page = ${componentName(pages[0]!.title)};
  return (
    <Layout>
      <Page />
    </Layout>
  );`
      : `  return (
    <Layout>
      <div className="p-6">App shell — add pages in a follow-up run.</div>
    </Layout>
  );`;

  return {
    path: "src/App.tsx",
    content: sanitizeAppIntegration(
      `${routerImports}${layoutImport}${imports ? `${imports}\n` : ""}
export default function App() {
${body}
}
`,
    ),
  };
}
