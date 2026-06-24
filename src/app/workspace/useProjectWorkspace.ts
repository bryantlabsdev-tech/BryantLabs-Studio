/**
 * Project workspace surface — open folder, scan, git, and shell layout.
 * Alias of {@link useWorkspaceProjectState} for clearer imports at call sites.
 */
export {
  useWorkspaceProjectState as useProjectWorkspace,
  type WorkspaceProjectState as ProjectWorkspaceState,
  type FileStatus,
  type ScanStatus,
  type OpenFile,
} from "@/app/workspace/useWorkspaceProjectState";
