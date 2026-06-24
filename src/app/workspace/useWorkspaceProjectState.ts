import { useCallback, useState } from "react";
import type { ProjectInfo, ProjectScan } from "@/types";
import type { GitDiffContents, GitStatusSnapshot } from "@/core/git/types";
import { loadPanelLayout } from "@/core/layout/panelLayout";
import type { CenterTab, DockTab, InsightsTab, RailTool } from "@/core/layout/types";
import type { OpenFile, WorkspaceFileStatus, WorkspaceScanStatus } from "./types";
import type { ProjectIndexStatus } from "@/core/projectIndex/types";

export type FileStatus = WorkspaceFileStatus;
export type ScanStatus = WorkspaceScanStatus;

export interface WorkspaceProjectState {
  readonly project: ProjectInfo | null;
  readonly setProject: React.Dispatch<React.SetStateAction<ProjectInfo | null>>;
  readonly activeFile: OpenFile | null;
  readonly setActiveFile: React.Dispatch<React.SetStateAction<OpenFile | null>>;
  readonly activePath: string | null;
  readonly setActivePath: React.Dispatch<React.SetStateAction<string | null>>;
  readonly openFileTabs: string[];
  readonly setOpenFileTabs: React.Dispatch<React.SetStateAction<string[]>>;
  readonly openFilesByPath: Record<string, OpenFile>;
  readonly setOpenFilesByPath: React.Dispatch<
    React.SetStateAction<Record<string, OpenFile>>
  >;
  readonly fileStatus: FileStatus;
  readonly setFileStatus: React.Dispatch<React.SetStateAction<FileStatus>>;
  readonly error: string | null;
  readonly setError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly scan: ProjectScan | null;
  readonly setScan: React.Dispatch<React.SetStateAction<ProjectScan | null>>;
  readonly scanStatus: ScanStatus;
  readonly setScanStatus: React.Dispatch<React.SetStateAction<ScanStatus>>;
  readonly projectIndexStatus: ProjectIndexStatus | null;
  readonly setProjectIndexStatus: React.Dispatch<
    React.SetStateAction<ProjectIndexStatus | null>
  >;
  readonly gitStatus: GitStatusSnapshot | null;
  readonly setGitStatus: React.Dispatch<React.SetStateAction<GitStatusSnapshot | null>>;
  readonly gitStatusLoading: boolean;
  readonly setGitStatusLoading: React.Dispatch<React.SetStateAction<boolean>>;
  readonly gitActionError: string | null;
  readonly setGitActionError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly selectedGitPath: string | null;
  readonly setSelectedGitPath: React.Dispatch<React.SetStateAction<string | null>>;
  readonly gitDiff: GitDiffContents | null;
  readonly setGitDiff: React.Dispatch<React.SetStateAction<GitDiffContents | null>>;
  readonly gitDiffLoading: boolean;
  readonly setGitDiffLoading: React.Dispatch<React.SetStateAction<boolean>>;
  readonly gitDiffError: string | null;
  readonly setGitDiffError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly railTool: RailTool;
  readonly setRailToolState: React.Dispatch<React.SetStateAction<RailTool>>;
  readonly commandPaletteOpen: boolean;
  readonly setCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  readonly dockOpen: boolean;
  readonly setDockOpen: React.Dispatch<React.SetStateAction<boolean>>;
  readonly insightsTab: InsightsTab;
  readonly setInsightsTab: React.Dispatch<React.SetStateAction<InsightsTab>>;
  readonly centerTab: CenterTab;
  readonly setCenterTab: React.Dispatch<React.SetStateAction<CenterTab>>;
  readonly dockTab: DockTab;
  readonly setDockTab: React.Dispatch<React.SetStateAction<DockTab>>;
  readonly editorReveal: { readonly line: number; readonly column: number } | null;
  readonly setEditorReveal: React.Dispatch<
    React.SetStateAction<{ line: number; column: number } | null>
  >;
  readonly setRailTool: (tool: RailTool) => void;
  readonly toggleDock: () => void;
  readonly openDock: () => void;
}

/** Project, scan, git, and shell layout state. */
export function useWorkspaceProjectState(): WorkspaceProjectState {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [activeFile, setActiveFile] = useState<OpenFile | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [openFileTabs, setOpenFileTabs] = useState<string[]>([]);
  const [openFilesByPath, setOpenFilesByPath] = useState<Record<string, OpenFile>>({});
  const [fileStatus, setFileStatus] = useState<FileStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ProjectScan | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [projectIndexStatus, setProjectIndexStatus] =
    useState<ProjectIndexStatus | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusSnapshot | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState(false);
  const [gitActionError, setGitActionError] = useState<string | null>(null);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitDiff, setGitDiff] = useState<GitDiffContents | null>(null);
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [gitDiffError, setGitDiffError] = useState<string | null>(null);
  const [railTool, setRailToolState] = useState<RailTool>("files");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(() => loadPanelLayout().dockOpen);
  const [insightsTab, setInsightsTab] = useState<InsightsTab>("dashboard");
  const [centerTab, setCenterTab] = useState<CenterTab>("editor");
  const [dockTab, setDockTab] = useState<DockTab>("problems");
  const [editorReveal, setEditorReveal] = useState<{
    line: number;
    column: number;
  } | null>(null);

  const setRailTool = useCallback((tool: RailTool) => {
    setRailToolState(tool);
  }, []);

  const toggleDock = useCallback(() => {
    setDockOpen((open) => !open);
  }, []);

  const openDock = useCallback(() => {
    setDockOpen(true);
  }, []);

  return {
    project,
    setProject,
    activeFile,
    setActiveFile,
    activePath,
    setActivePath,
    openFileTabs,
    setOpenFileTabs,
    openFilesByPath,
    setOpenFilesByPath,
    fileStatus,
    setFileStatus,
    error,
    setError,
    scan,
    setScan,
    scanStatus,
    setScanStatus,
    projectIndexStatus,
    setProjectIndexStatus,
    gitStatus,
    setGitStatus,
    gitStatusLoading,
    setGitStatusLoading,
    gitActionError,
    setGitActionError,
    selectedGitPath,
    setSelectedGitPath,
    gitDiff,
    setGitDiff,
    gitDiffLoading,
    setGitDiffLoading,
    gitDiffError,
    setGitDiffError,
    railTool,
    setRailToolState,
    commandPaletteOpen,
    setCommandPaletteOpen,
    dockOpen,
    setDockOpen,
    insightsTab,
    setInsightsTab,
    centerTab,
    setCenterTab,
    dockTab,
    setDockTab,
    editorReveal,
    setEditorReveal,
    setRailTool,
    toggleDock,
    openDock,
  };
}

export type { OpenFile } from "./types";
