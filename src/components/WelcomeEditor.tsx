import { useWorkspace } from "@/app/WorkspaceProvider";
import { OpenProjectButton } from "@/components/OpenProjectButton";

/**
 * Compact center welcome when no file is open (BLAI-style next actions).
 */
export function WelcomeEditor() {
  const { project, setRailTool, setCenterTab } = useWorkspace();

  return (
    <div className="welcome-editor">
      <h2 className="welcome-editor__title">Workspace</h2>
      <p className="welcome-editor__sub">
        One Agent handles everything — create apps in empty folders, edit follow-ups,
        and repair build errors from the chat on the left.
      </p>
      <ul className="welcome-editor__actions">
        <li>
          <button
            type="button"
            className="welcome-editor__btn"
            onClick={() => setRailTool("files")}
          >
            Browse files
          </button>
        </li>
        <li>
          <button
            type="button"
            className="welcome-editor__btn"
            onClick={() => setCenterTab("preview")}
          >
            Open preview
          </button>
        </li>
      </ul>
      {!project ? (
        <div className="welcome-editor__open">
          <OpenProjectButton label="Open Project" />
        </div>
      ) : (
        <p className="welcome-editor__project">
          Project: <code>{project.name}</code> — use Agent chat to build or change this app.
        </p>
      )}
    </div>
  );
}
