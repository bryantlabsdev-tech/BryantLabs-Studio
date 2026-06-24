import { APP_INFO } from "@/core/appInfo";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { OpenProjectButton } from "@/components/OpenProjectButton";
import { ProviderStatusPill } from "@/components/ProviderStatusPill";

/**
 * Top application bar: product identity, project name, and open project.
 */
export function TitleBar() {
  const { project, gitStatus, openGitPanel } = useWorkspace();

  return (
    <header className="titlebar titlebar--compact">
      <div className="titlebar__brand">
        <span className="titlebar__mark" aria-hidden="true" />
        <span className="titlebar__name">{APP_INFO.name}</span>
        {project ? (
          <span className="titlebar__project">
            <span className="titlebar__sep">/</span>
            {project.name}
            {gitStatus?.isRepo && gitStatus.branch ? (
              <button
                type="button"
                className="titlebar__git"
                onClick={openGitPanel}
                title="Open Git panel"
              >
                <span className="titlebar__sep">·</span>
                <span className="titlebar__git-branch">{gitStatus.branch}</span>
                {gitStatus.dirtyCount > 0 ? (
                  <span
                    className="titlebar__git-dirty"
                    title={`${gitStatus.dirtyCount} uncommitted change${gitStatus.dirtyCount === 1 ? "" : "s"}`}
                  >
                    {gitStatus.dirtyCount}
                  </span>
                ) : null}
              </button>
            ) : null}
          </span>
        ) : (
          <span className="titlebar__tagline">{APP_INFO.tagline}</span>
        )}
      </div>
      <div className="titlebar__actions">
        <ProviderStatusPill />
        <OpenProjectButton label={project ? "Change Project" : "Open Project"} />
      </div>
    </header>
  );
}
