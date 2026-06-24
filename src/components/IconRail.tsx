import { useWorkspace } from "@/app/WorkspaceProvider";
import type { RailTool } from "@/core/layout/types";
import {
  FolderIcon,
  MapIcon,
  PlugIcon,
  SearchIcon,
  MonitorIcon,
} from "@/components/icons";

const PRIMARY_TOOLS: ReadonlyArray<{
  id: RailTool;
  label: string;
  Icon: typeof FolderIcon;
}> = [
  { id: "files", label: "Files", Icon: FolderIcon },
  { id: "search", label: "Search", Icon: SearchIcon },
  { id: "repomap", label: "Repo map", Icon: MapIcon },
  { id: "providers", label: "Settings", Icon: PlugIcon },
];

/**
 * Minimal icon rail — primary navigation only. Expert tools via ⌘⇧P.
 */
export function IconRail() {
  const { railTool, setRailTool, setCenterTab, setCommandPaletteOpen } = useWorkspace();

  return (
    <nav className="icon-rail" aria-label="Tools">
      {PRIMARY_TOOLS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`icon-rail__btn${railTool === id ? " icon-rail__btn--on" : ""}`}
          title={label}
          aria-label={label}
          aria-current={railTool === id ? "page" : undefined}
          onClick={() => setRailTool(id)}
        >
          <Icon className="icon-rail__icon" />
          <span className="icon-rail__label">{label}</span>
        </button>
      ))}

      <button
        type="button"
        className="icon-rail__btn"
        title="Preview"
        aria-label="Preview"
        onClick={() => setCenterTab("preview")}
      >
        <MonitorIcon className="icon-rail__icon" />
        <span className="icon-rail__label">Preview</span>
      </button>

      <div className="icon-rail__spacer" />

      <button
        type="button"
        className="icon-rail__btn icon-rail__btn--palette"
        title="Command palette (⌘⇧P)"
        aria-label="Command palette"
        onClick={() => setCommandPaletteOpen(true)}
      >
        <span className="icon-rail__kbd">⌘⇧P</span>
      </button>
    </nav>
  );
}
