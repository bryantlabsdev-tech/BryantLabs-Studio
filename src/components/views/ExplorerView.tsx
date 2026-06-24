import { EmptyState } from "@/components/EmptyState";
import { FileTree } from "@/components/FileTree";
import { OpenProjectButton } from "@/components/OpenProjectButton";
import { FolderOpenIcon } from "@/components/icons";
import { useWorkspace } from "@/app/WorkspaceProvider";

/**
 * Sidebar "Files" view: project file tree with click-to-open in the editor.
 */
export function ExplorerView() {
  const { project, isDesktop } = useWorkspace();

  if (project) {
    return <FileTree project={project} />;
  }

  return (
    <div className="explorer__empty">
      <EmptyState
        title="No project open"
        description={
          isDesktop
            ? "Start by selecting a project folder to browse and read files."
            : "Project browsing is only available in the desktop app."
        }
        icon={<FolderOpenIcon />}
        action={
          isDesktop ? <OpenProjectButton variant="primary" label="Choose Project" /> : null
        }
      />
    </div>
  );
}
