import { useWorkspace } from "@/app/WorkspaceProvider";
import { FolderOpenIcon } from "@/components/icons";

interface OpenProjectButtonProps {
  label?: string;
  variant?: "primary" | "ghost";
}

/**
 * Triggers the native folder picker via the read-only workspace bridge.
 */
export function OpenProjectButton({
  label = "Open Project",
  variant = "ghost",
}: OpenProjectButtonProps) {
  const { openProject, isDesktop } = useWorkspace();

  return (
    <button
      type="button"
      className={`open-btn open-btn--${variant}`}
      onClick={() => void openProject()}
      disabled={!isDesktop}
      title={
        isDesktop ? "Open a local project folder" : "Available in the desktop app"
      }
    >
      <FolderOpenIcon className="open-btn__icon" />
      <span>{label}</span>
    </button>
  );
}
