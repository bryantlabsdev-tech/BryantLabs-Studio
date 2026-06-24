import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";

function componentName(title: string): string {
  return title.replace(/\s+/g, "");
}

/** Deterministic sidebar nav when generated Sidebar does not match the manifest. */
export function buildDeterministicSidebarFromManifest(
  manifest: GreenfieldManifest,
): GreenfieldProjectFile {
  const links = manifest.pages
    .map((p) => {
      const to = p.route === "/" ? "/" : p.route;
      return `        <NavLink to="${to}" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          ${p.title}
        </NavLink>`;
    })
    .join("\n");

  const navClass = manifest.useTailwind
    ? 'className="flex flex-col gap-2 p-4 min-w-[200px]"'
    : 'style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "1rem", minWidth: "200px" }}';

  return {
    path: "src/components/Sidebar.tsx",
    content: `import { NavLink } from "react-router-dom";

export function Sidebar() {
  return (
    <aside ${navClass}>
      <nav>
${links}
      </nav>
    </aside>
  );
}
`,
  };
}

export { componentName };
