import { useWorkspace } from "@/app/WorkspaceProvider";

function tabLabel(path: string): string {
  const segments = path.split(/[/\\]/);
  return segments[segments.length - 1] ?? path;
}

/**
 * VS Code-style open file tabs above the Monaco editor.
 */
export function EditorFileTabs() {
  const { openFileTabs, activePath, activateFile, closeFile, isEditorDirty } = useWorkspace();

  if (openFileTabs.length === 0) return null;

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open files">
      {openFileTabs.map((path) => {
        const active = path === activePath;
        return (
          <div
            key={path}
            className={`editor-tabs__tab${active ? " editor-tabs__tab--on" : ""}`}
            role="presentation"
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="editor-tabs__label"
              title={path}
              onClick={() => activateFile(path)}
            >
              {isEditorDirty(path) ? `${tabLabel(path)} •` : tabLabel(path)}
            </button>
            <button
              type="button"
              className="editor-tabs__close"
              aria-label={`Close ${tabLabel(path)}`}
              onClick={(event) => {
                event.stopPropagation();
                closeFile(path);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
