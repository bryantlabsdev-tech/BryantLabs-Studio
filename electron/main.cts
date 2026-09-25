import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";

// Chromium HTTP/2 in Electron truncates some JSON POST bodies (~8 KiB), which
// Anthropic rejects as "request body is not valid JSON". Force HTTP/1.1 before ready.
app.commandLine.appendSwitch("disable-http2");
import * as path from "node:path";
import { configureE2eRuntimePaths } from "./e2eRuntime.cjs";
import { resolveAppIconPath } from "./appIcon.cjs";
import {
  approveWorkspaceRoot,
  isApprovedWorkspaceRoot,
  normalizeWorkspaceRoot,
} from "./approvedWorkspaceRoot.cjs";

configureE2eRuntimePaths();
import { promises as fs, realpathSync } from "node:fs";
import { scanProject } from "./projectScanner.cjs";
import {
  commitGit,
  getGitBranch,
  getGitDiffContents,
  getGitStatus,
  restoreGitPaths,
  stageGitPaths,
  unstageGitPaths,
} from "./projectGit.cjs";
import {
  readProjectMemory,
  writeProjectMemory,
  type ProjectMemoryRecord,
} from "./projectMemory.cjs";
import {
  readAgentMemory,
  writeAgentMemory,
} from "./agentMemory.cjs";
import {
  readSessionMemory,
  writeSessionMemory,
  normalizeSessionMemoryRecord,
} from "./sessionMemory.cjs";
import {
  readFeatureInventory,
  writeFeatureInventory,
} from "./features.cjs";
import {
  readFollowUpChat,
  writeFollowUpChat,
  normalizeFollowUpChatRecord,
} from "./followUpChatStore.cjs";
import {
  applyEdit,
  createProjectFile,
  deleteProjectFile,
  validateWritePath,
  isCanonicalPathWithinRoot,
} from "./fileWriter.cjs";
import { loadTrustedInstructionSources } from "./instructionPackLoad.cjs";
import {
  cancelGitPushToken,
  clearGitPushSession,
  executeApprovedGitPush,
  gitPushAllowsLocalRemotes,
  prepareGitPush,
} from "./gitPush.cjs";
import {
  cancelGitBranchToken,
  clearGitBranchSession,
  executeApprovedGitBranch,
  listLocalGitBranches,
  prepareGitBranch,
  revokeGitBranchOwner,
} from "./gitBranch.cjs";
import {
  cancelGitWorktreeToken,
  clearGitWorktreeSession,
  executeApprovedGitWorktreeCreate,
  executeApprovedGitWorktreeRemove,
  listStudioWorktrees,
  prepareGitWorktreeCreate,
  prepareGitWorktreeRemove,
  resolveGitWorktreeOpen,
  revokeGitWorktreeOwner,
  worktreeFailureMessage,
} from "./gitWorktree.cjs";
import { createFsUndoIo, createLastEditStore, parseUndoBatchEntries } from "./lastEditBatch.cjs";
import { runVerification, type VerificationResult } from "./verifier.cjs";
import {
  checkHealth,
  runTest,
  runAgentStep,
  runPlan,
  runPatch,
  runApplyPlanBatchPatch,
  runAutoFix,
  getSettingsView,
  saveSettings,
  sanitizeProviderSettingsInput,
  revealApiKey,
  loadRawSettings,
  ensureProviderSecretsMigrated,
  type ProviderId,
  type PlanContext,
  type PatchTargetFile,
  type PatchSymbol,
} from "./providers/index.cjs";
import { applyE2eRealProviderSettings } from "./providers/e2eRealProvider.cjs";
import {
  runGreenfieldGenerate,
  runGreenfieldRawGenerate,
  buildThrownGenerateResult,
  handleGreenfieldWriteIpc,
  isEmptyDirectory,
  clearDirectoryContents,
  findNextNumberedSiblingFolder,
  FOLDER_NOT_EMPTY_CODE,
  runGreenfieldSetup,
  runGreenfieldTypecheck,
  runGreenfieldBuild,
  startPreview,
  stopPreview,
  stopPreviewAsync,
  getPreviewState,
  probePreviewUrl,
  auditGreenfieldPreviewUrl,
  isAllowedPreviewUrl,
  type GeneratedFile,
} from "./greenfield/index.cjs";
import {
  destroyAllTerminals,
  registerTerminalIpc,
} from "./terminal.cjs";
import { registerTerminalExecIpc, clearAgentExecutionSession } from "./agentExecution.cjs";
import { registerProjectGrepIpc } from "./projectGrep.cjs";
import { registerMcpIpc } from "./mcp/register.cjs";
import {
  semanticSearch,
} from "./semanticIndex/indexer.cjs";
import { registerSemanticIndexIpc } from "./semanticIndex/register.cjs";
import { registerProjectIndexIpc } from "./projectIndex/register.cjs";
import { registerProjectProblemsIpc } from "./projectProblems/register.cjs";
import { registerShadowWorkspaceIpc } from "./shadowWorkspace.cjs";
import {
  activateProjectIndex,
  getCachedProjectScan,
  notifyProjectFilesChanged,
} from "./projectIndex/coordinator.cjs";
import { relPathFromAbs } from "./projectIndex/deltaScanner.cjs";
import {
  hydrateProjectAfterSwitch,
  switchToProjectRoot,
} from "./projectActivate.cjs";
import {
  createQuitTeardownCoordinator,
  shouldQuitWhenAllWindowsClosed,
} from "./quitTeardown.cjs";
import {
  clearRunCheckpointForProject,
  loadRunCheckpointForProject,
  saveRunCheckpointForProject,
} from "./runCheckpoint.cjs";

/**
 * Electron main process for BryantLabs Studio (Phase 2 — Workspace Foundation).
 *
 * Adds a strictly READ-ONLY filesystem bridge: open a project folder, list
 * directory contents, and read a file's text. There are deliberately no write,
 * delete, move, or execute capabilities — and every path is validated to stay
 * within the currently opened project root.
 */

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/** Maximum file size we will read into the editor (bytes). */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Directory entries hidden from the explorer to reduce noise. */
const IGNORED_ENTRIES = new Set([".git", ".DS_Store"]);

let mainWindow: BrowserWindow | null = null;

/** Absolute path of the currently opened project. Reads are confined to it. */
let projectRoot: string | null = null;

/** Single-level undo batch for the last applied edit or Apply Plan write. */
const lastEditStore = createLastEditStore();

/** Guards against overlapping verification runs. */
let verifying = false;

interface EditResult {
  ok: boolean;
  content?: string;
  path?: string;
  reason?: string;
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
}

interface ProjectInfo {
  path: string;
  name: string;
}

interface ReadFileResult {
  content: string;
  language: string | null;
  readable: boolean;
  reason?: string;
}

function rejectUnapprovedRoot(root: unknown): string | { error: string } {
  if (typeof root !== "string" || root.trim().length === 0) {
    return { error: "Invalid project path." };
  }
  const resolved = normalizeWorkspaceRoot(root);
  if (!isApprovedWorkspaceRoot(resolved, projectRoot)) {
    return { error: "Path is not an approved project folder." };
  }
  return resolved;
}

/** Ensure a resolved path is inside the opened project root (no traversal). */
function isWithinProject(target: string): boolean {
  if (!projectRoot) return false;
  const resolved = path.resolve(target);
  const root = path.resolve(projectRoot);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** Containment for mutating/execution contexts such as terminal cwd. */
function isExecutionPathWithinProject(target: string): boolean {
  if (!projectRoot) return false;
  return isCanonicalPathWithinRoot(projectRoot, target);
}

function languageFromExtension(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".html": "xml",
    ".xml": "xml",
    ".css": "css",
    ".scss": "scss",
    ".md": "markdown",
    ".markdown": "markdown",
    ".py": "python",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".sql": "sql",
    ".swift": "swift",
    ".kt": "kotlin",
    ".toml": "ini",
    ".ini": "ini",
  };
  return map[ext] ?? null;
}

function createWindow(): void {
  const iconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: "#0b0d12",
    show: false,
    title: "BryantLabs Studio",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    clearGitPushSession();
    void clearGitBranchSession();
    void clearGitWorktreeSession();
    void clearAgentExecutionSession();
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

/** Switch the open project — tears down PTYs, preview, and stale index work first. */
async function switchProjectRoot(selected: string): Promise<void> {
  clearGitPushSession();
  await clearGitBranchSession();
  await clearGitWorktreeSession();
  await clearAgentExecutionSession();
  const approved = approveWorkspaceRoot(selected);
  await switchToProjectRoot(approved, async (root) => {
    projectRoot = root;
    lastEditStore.clear();
    hydrateProjectAfterSwitch(root);
    await activateProjectIndex(root, () => mainWindow);
  });
}

function notifyIndexFileChange(filePath: string, deleted = false): void {
  if (!projectRoot) return;
  const rel = relPathFromAbs(projectRoot, filePath) ?? filePath;
  if (deleted) {
    notifyProjectFilesChanged(projectRoot, [], [rel]);
  } else {
    notifyProjectFilesChanged(projectRoot, [rel]);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    "project:openAt",
    async (_event, folderPath: string): Promise<ProjectInfo | null> => {
      if (typeof folderPath !== "string" || folderPath.length === 0) return null;
      const selected = path.resolve(folderPath);
      try {
        const stat = await fs.stat(selected);
        if (!stat.isDirectory()) return null;
      } catch {
        return null;
      }
      await switchProjectRoot(selected);
      return { path: selected, name: path.basename(selected) };
    },
  );

  ipcMain.handle("project:open", async (): Promise<ProjectInfo | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open Project",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const selected = path.resolve(result.filePaths[0]!);
    await switchProjectRoot(selected);
    return { path: selected, name: path.basename(selected) };
  });

  ipcMain.handle(
    "fs:listDirectory",
    async (_event, dirPath: string): Promise<FileNode[]> => {
      if (typeof dirPath !== "string" || !isWithinProject(dirPath)) {
        return [];
      }
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const nodes: FileNode[] = [];
        for (const entry of entries) {
          if (IGNORED_ENTRIES.has(entry.name)) continue;
          if (!entry.isFile() && !entry.isDirectory()) continue;
          nodes.push({
            name: entry.name,
            path: path.join(dirPath, entry.name),
            type: entry.isDirectory() ? "directory" : "file",
          });
        }
        nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return nodes;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Directory read failed.";
        console.warn(`[filesystem] readdir failed — ${message}`);
        return [];
      }
    },
  );

  ipcMain.handle("fs:loadProjectInstructionPack", async () => {
    if (!projectRoot) {
      return { sources: [], skipped: [] };
    }
    return loadTrustedInstructionSources(projectRoot);
  });

  ipcMain.handle(
    "fs:readFile",
    async (_event, filePath: string): Promise<ReadFileResult> => {
      if (typeof filePath !== "string" || !isWithinProject(filePath)) {
        return { content: "", language: null, readable: false, reason: "Path is outside the project." };
      }
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          return { content: "", language: null, readable: false, reason: "Not a file." };
        }
        if (stat.size > MAX_FILE_BYTES) {
          return {
            content: "",
            language: null,
            readable: false,
            reason: "File is too large to display (over 2 MB).",
          };
        }
        const buffer = await fs.readFile(filePath);
        if (buffer.includes(0)) {
          return {
            content: "",
            language: null,
            readable: false,
            reason: "Binary file — cannot be displayed.",
          };
        }
        return {
          content: buffer.toString("utf8"),
          language: languageFromExtension(filePath),
          readable: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Read failed.";
        console.warn(`[filesystem] read failed — ${message}`);
        return {
          content: "",
          language: null,
          readable: false,
          reason: message,
        };
      }
    },
  );

  ipcMain.handle("project:gitBranch", async (): Promise<string | null> => {
    if (!projectRoot) return null;
    return getGitBranch(projectRoot);
  });

  ipcMain.handle("git:status", async () => {
    if (!projectRoot) return null;
    return getGitStatus(projectRoot);
  });

  ipcMain.handle("git:diffContents", async (_event, relPath: unknown) => {
    if (!projectRoot) {
      return { original: "", modified: "", error: "No project open." };
    }
    if (typeof relPath !== "string") {
      return { original: "", modified: "", error: "Invalid file path." };
    }
    return getGitDiffContents(projectRoot, relPath);
  });

  ipcMain.handle("git:stage", async (_event, paths: unknown) => {
    if (!projectRoot) return { ok: false, reason: "No project open." };
    if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
      return { ok: false, reason: "Invalid paths." };
    }
    return stageGitPaths(projectRoot, paths);
  });

  ipcMain.handle("git:unstage", async (_event, paths: unknown) => {
    if (!projectRoot) return { ok: false, reason: "No project open." };
    if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
      return { ok: false, reason: "Invalid paths." };
    }
    return unstageGitPaths(projectRoot, paths);
  });

  ipcMain.handle("git:restore", async (_event, paths: unknown) => {
    if (!projectRoot) return { ok: false, reason: "No project open." };
    if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
      return { ok: false, reason: "Invalid paths." };
    }
    return restoreGitPaths(projectRoot, paths);
  });

  ipcMain.handle("git:commit", async (_event, message: unknown) => {
    if (!projectRoot) return { ok: false, reason: "No project open." };
    if (typeof message !== "string") {
      return { ok: false, reason: "Invalid commit message." };
    }
    return commitGit(projectRoot, message);
  });

  ipcMain.handle("git:pushPreflight", async () => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: "Open a project before pushing." };
    }
    return prepareGitPush(projectRoot, { allowLocalRemotes: gitPushAllowsLocalRemotes() });
  });

  ipcMain.handle("git:pushExecute", async (_event, token: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: "Open a project before pushing." };
    }
    if (typeof token !== "string") {
      return { ok: false as const, code: "token_invalid" as const, message: "Push approval expired. Start a new push from the Git view." };
    }
    return executeApprovedGitPush(projectRoot, token, {
      allowLocalRemotes: gitPushAllowsLocalRemotes(),
    });
  });

  ipcMain.handle("git:pushCancel", async (_event, token: unknown) => {
    if (typeof token === "string") cancelGitPushToken(token);
    return { ok: true as const };
  });

  ipcMain.handle("git:listLocalBranches", async () => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: "Open a project before changing branches." };
    }
    return listLocalGitBranches(projectRoot);
  });

  const branchOwnersBound = new Set<number>();
  const bindBranchOwner = (sender: Electron.WebContents): number => {
    const ownerId = sender.id;
    if (!branchOwnersBound.has(ownerId)) {
      branchOwnersBound.add(ownerId);
      sender.once("destroyed", () => {
        branchOwnersBound.delete(ownerId);
        revokeGitBranchOwner(ownerId);
      });
    }
    return ownerId;
  };

  ipcMain.handle("git:branchPreflight", async (event, payload: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: "Open a project before changing branches." };
    }
    const ownerId = bindBranchOwner(event.sender);
    const body =
      payload && typeof payload === "object"
        ? (payload as { op?: unknown; destination?: unknown })
        : {};
    return prepareGitBranch(projectRoot, { op: body.op, destination: body.destination }, { ownerId });
  });

  ipcMain.handle("git:branchExecute", async (event, token: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: "Open a project before changing branches." };
    }
    if (typeof token !== "string") {
      return { ok: false as const, code: "token_invalid" as const, message: "Branch approval expired. Start again from the Git view." };
    }
    const ownerId = bindBranchOwner(event.sender);
    return executeApprovedGitBranch(projectRoot, token, {
      ownerId,
      isStillOpenRoot: (canonical) => {
        if (!projectRoot) return false;
        try {
          return realpathSync(projectRoot) === canonical;
        } catch {
          return false;
        }
      },
    });
  });

  ipcMain.handle("git:branchCancel", async (event, token: unknown) => {
    if (typeof token === "string") cancelGitBranchToken(token, event.sender.id);
    return { ok: true as const };
  });

  const worktreeOwnersBound = new Set<number>();
  const bindWorktreeOwner = (sender: Electron.WebContents): number => {
    const ownerId = sender.id;
    if (!worktreeOwnersBound.has(ownerId)) {
      worktreeOwnersBound.add(ownerId);
      sender.once("destroyed", () => {
        worktreeOwnersBound.delete(ownerId);
        revokeGitWorktreeOwner(ownerId);
      });
    }
    return ownerId;
  };

  const stillOpenRoot = (canonical: string): boolean => {
    if (!projectRoot) return false;
    try {
      return realpathSync(projectRoot) === canonical;
    } catch {
      return false;
    }
  };

  ipcMain.handle("git:worktreeList", async () => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: worktreeFailureMessage("no_project") };
    }
    return listStudioWorktrees(projectRoot);
  });

  ipcMain.handle("git:worktreeCreatePreflight", async (event, payload: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: worktreeFailureMessage("no_project") };
    }
    const ownerId = bindWorktreeOwner(event.sender);
    const body =
      payload && typeof payload === "object"
        ? (payload as { destinationBranch?: unknown })
        : {};
    return prepareGitWorktreeCreate(projectRoot, { destinationBranch: body.destinationBranch }, { ownerId });
  });

  ipcMain.handle("git:worktreeCreateExecute", async (event, token: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: worktreeFailureMessage("no_project") };
    }
    if (typeof token !== "string") {
      return { ok: false as const, code: "token_invalid" as const, message: worktreeFailureMessage("token_invalid") };
    }
    const ownerId = bindWorktreeOwner(event.sender);
    return executeApprovedGitWorktreeCreate(projectRoot, token, { ownerId, isStillOpenRoot: stillOpenRoot });
  });

  ipcMain.handle("git:worktreeRemovePreflight", async (event, payload: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: worktreeFailureMessage("no_project") };
    }
    const ownerId = bindWorktreeOwner(event.sender);
    const body = payload && typeof payload === "object" ? (payload as { id?: unknown }) : {};
    return prepareGitWorktreeRemove(projectRoot, { id: body.id }, { ownerId });
  });

  ipcMain.handle("git:worktreeRemoveExecute", async (event, token: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: worktreeFailureMessage("no_project") };
    }
    if (typeof token !== "string") {
      return { ok: false as const, code: "token_invalid" as const, message: worktreeFailureMessage("token_invalid") };
    }
    const ownerId = bindWorktreeOwner(event.sender);
    return executeApprovedGitWorktreeRemove(projectRoot, token, { ownerId, isStillOpenRoot: stillOpenRoot });
  });

  ipcMain.handle("git:worktreeCancel", async (event, token: unknown) => {
    if (typeof token === "string") cancelGitWorktreeToken(token, event.sender.id);
    return { ok: true as const };
  });

  ipcMain.handle("git:worktreeOpen", async (event, payload: unknown) => {
    if (!projectRoot) {
      return { ok: false as const, code: "no_project" as const, message: worktreeFailureMessage("no_project") };
    }
    bindWorktreeOwner(event.sender);
    const body = payload && typeof payload === "object" ? (payload as { id?: unknown }) : {};
    const epochBefore = projectRoot;
    const resolved = await resolveGitWorktreeOpen(projectRoot, { id: body.id });
    if (!resolved.ok) return resolved;
    if (projectRoot !== epochBefore) {
      return { ok: false as const, code: "stale_project" as const, message: worktreeFailureMessage("stale_project") };
    }
    await switchProjectRoot(resolved.path);
    return { ok: true as const, project: { path: resolved.path, name: resolved.name } };
  });

  ipcMain.handle("project:memory:read", async (): Promise<ProjectMemoryRecord | null> => {
    if (!projectRoot) return null;
    const name = path.basename(projectRoot);
    return readProjectMemory(projectRoot, name);
  });

  ipcMain.handle(
    "project:memory:write",
    async (_event, memory: unknown): Promise<{ ok: boolean; reason?: string }> => {
      if (!projectRoot) {
        return { ok: false, reason: "No project open." };
      }
      if (!memory || typeof memory !== "object") {
        return { ok: false, reason: "Invalid project memory." };
      }
      const m = memory as Partial<ProjectMemoryRecord>;
      return writeProjectMemory(projectRoot, {
        projectName: typeof m.projectName === "string" ? m.projectName : "",
        architecture: typeof m.architecture === "string" ? m.architecture : "",
        userPreferences:
          typeof m.userPreferences === "string" ? m.userPreferences : "",
        notes: typeof m.notes === "string" ? m.notes : "",
        updatedAt: typeof m.updatedAt === "number" ? m.updatedAt : Date.now(),
      });
    },
  );

  ipcMain.handle("project:agentMemory:read", async () => {
    if (!projectRoot) return null;
    return readAgentMemory(projectRoot);
  });

  ipcMain.handle(
    "project:agentMemory:write",
    async (_event, store: unknown): Promise<{ ok: boolean; reason?: string }> => {
      if (!projectRoot) {
        return { ok: false, reason: "No project open." };
      }
      if (!store || typeof store !== "object") {
        return { ok: false, reason: "Invalid agent memory store." };
      }
      return writeAgentMemory(projectRoot, store as import("./agentMemory.cjs").AgentMemoryStoreRecord);
    },
  );

  ipcMain.handle("project:sessionMemory:read", async () => {
    if (!projectRoot) return null;
    let branch: string | null = null;
    try {
      branch = await getGitBranch(projectRoot);
    } catch {
      branch = null;
    }
    return readSessionMemory(projectRoot, branch);
  });

  ipcMain.handle(
    "project:sessionMemory:write",
    async (_event, memory: unknown): Promise<{ ok: boolean; reason?: string }> => {
      if (!projectRoot) {
        return { ok: false, reason: "No project open." };
      }
      if (!memory || typeof memory !== "object") {
        return { ok: false, reason: "Invalid session memory." };
      }
      let branch: string | null = null;
      try {
        branch = await getGitBranch(projectRoot);
      } catch {
        branch = null;
      }
      const normalized = normalizeSessionMemoryRecord(memory, projectRoot, branch);
      return writeSessionMemory(projectRoot, normalized);
    },
  );

  ipcMain.handle("project:features:read", async () => {
    if (!projectRoot) return null;
    return readFeatureInventory(projectRoot);
  });

  ipcMain.handle("project:followUpChat:read", async () => {
    if (!projectRoot) return null;
    return readFollowUpChat(projectRoot);
  });

  ipcMain.handle(
    "project:followUpChat:write",
    async (_event, messages: unknown): Promise<{ ok: boolean; reason?: string }> => {
      if (!projectRoot) {
        return { ok: false, reason: "No project open." };
      }
      const record = normalizeFollowUpChatRecord(
        { version: 1, projectPath: projectRoot, updatedAt: Date.now(), messages },
        projectRoot,
      );
      return writeFollowUpChat(projectRoot, record.messages);
    },
  );

  ipcMain.handle(
    "project:features:write",
    async (_event, inventory: unknown): Promise<{ ok: boolean; reason?: string }> => {
      if (!projectRoot) {
        return { ok: false, reason: "No project open." };
      }
      if (!inventory || typeof inventory !== "object") {
        return { ok: false, reason: "Invalid feature inventory." };
      }
      const inv = inventory as import("./features.cjs").FeatureInventoryRecord;
      return writeFeatureInventory(projectRoot, {
        version: 1,
        projectPath: projectRoot,
        updatedAt: Date.now(),
        features: Array.isArray(inv.features) ? inv.features : [],
      });
    },
  );

  ipcMain.handle("runCheckpoint:load", async (_event, projectPath: unknown) => {
    if (!projectRoot) return null;
    if (typeof projectPath !== "string" || projectPath.length === 0) return null;
    return loadRunCheckpointForProject(projectRoot, projectPath);
  });

  ipcMain.handle("runCheckpoint:save", async (_event, checkpoint: unknown) => {
    if (!projectRoot) {
      return { ok: false, reason: "No project open." };
    }
    if (!checkpoint || typeof checkpoint !== "object") {
      return { ok: false, reason: "Invalid checkpoint." };
    }
    return saveRunCheckpointForProject(projectRoot, checkpoint);
  });

  ipcMain.handle("runCheckpoint:clear", async (_event, projectPath: unknown) => {
    if (!projectRoot) {
      return { ok: false, reason: "No project open." };
    }
    if (typeof projectPath !== "string" || projectPath.length === 0) {
      return { ok: false, reason: "Invalid project path." };
    }
    return clearRunCheckpointForProject(projectRoot, projectPath);
  });

  ipcMain.handle(
    "edit:apply",
    async (
      _event,
      filePath: string,
      expectedBefore: string,
      after: string,
      recordUndoFlag?: unknown,
    ): Promise<EditResult> => {
      if (
        typeof filePath !== "string" ||
        typeof expectedBefore !== "string" ||
        typeof after !== "string"
      ) {
        return { ok: false, reason: "Invalid edit request." };
      }
      const recordUndo = recordUndoFlag !== false;
      const result = await applyEdit(projectRoot, filePath, expectedBefore, after);
      if (result.ok && result.previousContent !== undefined) {
        if (recordUndo) {
          lastEditStore.recordSingle({
            path: filePath,
            previousContent: result.previousContent,
            created: false,
          });
        }
        notifyIndexFileChange(filePath);
      }
      return result.ok
        ? { ok: true, content: result.content, path: filePath }
        : { ok: false, reason: result.reason };
    },
  );

  ipcMain.handle(
    "edit:createFile",
    async (
      _event,
      filePath: string,
      content: string,
    ): Promise<EditResult> => {
      if (typeof filePath !== "string" || typeof content !== "string") {
        return { ok: false, reason: "Invalid create request." };
      }
      const result = await createProjectFile(projectRoot, filePath, content);
      if (result.ok) {
        lastEditStore.recordSingle({
          path: filePath,
          previousContent: "",
          created: true,
        });
        notifyIndexFileChange(filePath);
      }
      return result.ok
        ? { ok: true, content: result.content, path: filePath }
        : { ok: false, reason: result.reason };
    },
  );

  ipcMain.handle(
    "edit:deleteFile",
    async (_event, filePath: string): Promise<EditResult> => {
      if (typeof filePath !== "string") {
        return { ok: false, reason: "Invalid delete request." };
      }
      const result = await deleteProjectFile(projectRoot, filePath);
      if (result.ok) {
        notifyIndexFileChange(filePath, true);
      }
      return result.ok
        ? { ok: true, content: "", path: filePath }
        : { ok: false, reason: result.reason };
    },
  );

  ipcMain.handle(
    "edit:replaceUndoBatch",
    async (_event, input: unknown): Promise<EditResult> => {
      const parsed = parseUndoBatchEntries(input);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      for (const entry of parsed.entries) {
        const pathCheck = validateWritePath(projectRoot, entry.path);
        if (!pathCheck.ok) {
          return { ok: false, reason: pathCheck.reason ?? "Invalid undo batch path." };
        }
      }
      lastEditStore.replace(parsed.entries);
      return { ok: true };
    },
  );

  ipcMain.handle("edit:undoLast", async (): Promise<EditResult> => {
    const result = await lastEditStore.undo(
      projectRoot,
      createFsUndoIo(notifyIndexFileChange),
    );
    return result.ok
      ? { ok: true, content: result.content, path: result.path }
      : { ok: false, reason: result.reason, path: result.path };
  });

  ipcMain.handle(
    "verify:run",
    async (): Promise<VerificationResult | { error: string }> => {
      if (!projectRoot) return { error: "No project is open." };
      if (verifying) return { error: "A verification run is already in progress." };
      verifying = true;
      try {
        return await runVerification(projectRoot);
      } finally {
        verifying = false;
      }
    },
  );

  // ---- Provider system (Phase 7) — read-only model communication ----
  ipcMain.handle("providers:getSettings", async () => getSettingsView());

  ipcMain.handle("providers:saveSettings", async (_event, input: unknown) => {
    try {
      return await saveSettings(sanitizeProviderSettingsInput(input));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save provider settings.";
      console.warn(`[filesystem] write failed — ${message}`);
      throw err;
    }
  });

  ipcMain.handle("providers:revealApiKey", async (_event, provider: unknown) => {
    if (typeof provider !== "string") {
      return { ok: false, error: "Invalid provider." };
    }
    const e2e =
      Boolean(process.env.BRYANTLABS_E2E_PROJECT) ||
      process.env.BRYANTLABS_MOCK_PROVIDER === "1";
    if (!e2e && mainWindow && !mainWindow.isDestroyed()) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["Reveal", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        message: "Reveal stored API key?",
        detail: "The key will be shown in Settings.",
      });
      if (response !== 0) return { ok: false, error: "Cancelled." };
    }
    return revealApiKey(provider as ProviderId);
  });

  ipcMain.handle(
    "providers:health",
    async (_event, provider: ProviderId) => checkHealth(provider),
  );

  ipcMain.handle("providers:cancelActive", async (_event, scope?: unknown) => {
    const { cancelActiveProviderRequests } = await import(
      "./providers/providerRequestRegistry.cjs"
    );
    const scoped = typeof scope === "string" && scope.length > 0 ? scope : undefined;
    return { cancelled: cancelActiveProviderRequests("user_cancel", scoped) };
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const transportDiag = require("./providers/transportDiagnostics.cjs") as typeof import("./providers/transportDiagnostics.cjs");
  transportDiag.setTransportDiagnosticsBroadcast((event) => {
    if (!transportDiag.isTransportEventInteresting(event)) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("providers:transport-event", event);
      }
    }
  });
  ipcMain.handle("providers:getTransportDiagnostics", async () =>
    transportDiag
      .getTransportDiagnosticsRing()
      .filter(transportDiag.isTransportEventInteresting),
  );
  ipcMain.handle("providers:clearTransportDiagnostics", async () => {
    transportDiag.clearTransportDiagnosticsRing();
    return { ok: true as const };
  });

  ipcMain.handle(
    "providers:test",
    async (_event, provider: ProviderId, prompt: string) =>
      runTest(provider, typeof prompt === "string" ? prompt : ""),
  );

  ipcMain.handle(
    "providers:agentStep",
    async (_event, provider: ProviderId, prompt: string) =>
      runAgentStep(provider, typeof prompt === "string" ? prompt : ""),
  );

  ipcMain.handle(
    "providers:plan",
    async (
      _event,
      provider: ProviderId,
      prompt: string,
      context: PlanContext,
    ) => runPlan(provider, typeof prompt === "string" ? prompt : "", context),
  );

  ipcMain.handle(
    "providers:patch",
    async (
      _event,
      provider: ProviderId,
      prompt: string,
      context: PlanContext,
      file: PatchTargetFile,
      symbols: PatchSymbol[],
      planMeta?: { planSummary: string; fileReason: string },
    ) =>
      runPatch(
        provider,
        typeof prompt === "string" ? prompt : "",
        context,
        file,
        Array.isArray(symbols) ? symbols : [],
        planMeta &&
        typeof planMeta.planSummary === "string" &&
        typeof planMeta.fileReason === "string"
          ? planMeta
          : undefined,
      ),
  );

  ipcMain.handle("providers:applyPlanBatchPing", async () => {
    console.error("[ipc:applyPlanBatchPing] ok");
    return { ok: true as const };
  });

  ipcMain.handle(
    "providers:applyPlanBatchJson",
    async (_event, payloadJson: unknown) => {
      const started = Date.now();
      console.error(
        `[ipc:applyPlanBatchJson] start bytes=${typeof payloadJson === "string" ? payloadJson.length : -1}`,
      );
      if (typeof payloadJson !== "string" || payloadJson.length === 0) {
        return {
          ok: false,
          provider: "anthropic",
          model: "",
          raw: null,
          latencyMs: 0,
          error: "Apply Plan payload missing or not a JSON string.",
          missingPaths: [],
        };
      }
      let parsed: {
        provider?: ProviderId;
        prompt?: string;
        context?: PlanContext;
        files?: PatchTargetFile[];
        meta?: { planSummary: string; targetPaths: string[]; repair?: boolean };
      };
      try {
        parsed = JSON.parse(payloadJson) as typeof parsed;
      } catch (err) {
        return {
          ok: false,
          provider: "anthropic",
          model: "",
          raw: null,
          latencyMs: Date.now() - started,
          error: `Invalid Apply Plan JSON payload: ${err instanceof Error ? err.message : String(err)}`,
          missingPaths: [],
        };
      }
      const provider = parsed.provider ?? "anthropic";
      const prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
      const files = Array.isArray(parsed.files) ? parsed.files : [];
      const context = (parsed.context ?? {}) as PlanContext;
      const meta =
        parsed.meta &&
        typeof parsed.meta.planSummary === "string" &&
        Array.isArray(parsed.meta.targetPaths)
          ? parsed.meta
          : { planSummary: "", targetPaths: [] };
      console.error(
        `[ipc:applyPlanBatchJson] parsed provider=${provider} files=${files.length} promptChars=${prompt.length}`,
      );
      return runApplyPlanBatchPatch(provider, prompt, context, files, meta);
    },
  );

  ipcMain.handle(
    "providers:applyPlanBatch",
    async (
      _event,
      provider: ProviderId,
      prompt: string,
      context: PlanContext,
      files: PatchTargetFile[],
      meta?: { planSummary: string; targetPaths: string[]; repair?: boolean },
    ) => {
      console.error(
        `[ipc:applyPlanBatch] provider=${provider} files=${Array.isArray(files) ? files.length : -1}`,
      );
      return runApplyPlanBatchPatch(
        provider,
        typeof prompt === "string" ? prompt : "",
        context,
        Array.isArray(files) ? files : [],
        meta &&
        typeof meta.planSummary === "string" &&
        Array.isArray(meta.targetPaths)
          ? meta
          : { planSummary: "", targetPaths: [] },
      );
    },
  );

  ipcMain.handle(
    "providers:autoFix",
    async (
      _event,
      provider: ProviderId,
      context: import("./providers/autoFix.cjs").AutoFixContextPayload,
      file: PatchTargetFile,
    ) => runAutoFix(provider, context, file),
  );

  // ---- Greenfield app generation (Phase 10) ----
  ipcMain.handle(
    "greenfield:selectFolder",
    async (event): Promise<ProjectInfo | { error: string } | null> => {
      const parent =
        BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      if (!parent) {
        console.error(
          "[greenfield] Folder picker failed: no browser window available",
        );
        return { error: "Could not open folder picker." };
      }
      try {
        const settings = await loadRawSettings();
        const writeMode = settings.fileWriteMode ?? "workspace";
        const result = await dialog.showOpenDialog(parent, {
          title:
            writeMode === "safe"
              ? "Select Empty Folder for New App"
              : "Select Folder for New App",
          properties: ["openDirectory"],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }
        const selected = approveWorkspaceRoot(result.filePaths[0]!);
        if (writeMode === "safe" && !(await isEmptyDirectory(selected))) {
          return {
            error:
              "Please select an empty folder (Safe Mode is enabled in Settings).",
          };
        }
        return { path: selected, name: path.basename(selected) };
      } catch (err) {
        console.error(
          "[greenfield] Folder picker failed:",
          err instanceof Error ? err.message : "unknown error",
        );
        return { error: "Could not open folder picker." };
      }
    },
  );

  ipcMain.handle(
    "greenfield:generate",
    async (_event, provider: ProviderId, prompt: string, generationId?: unknown) => {
      const id =
        provider === "gemini" ||
        provider === "ollama" ||
        provider === "anthropic" ||
        provider === "groq" ||
        provider === "openrouter"
          ? provider
          : "ollama";
      const { runInProviderRequestScope } = await import(
        "./providers/providerRequestRegistry.cjs"
      );
      const scope = typeof generationId === "string" && generationId ? generationId : undefined;
      try {
        return await runInProviderRequestScope(scope, () =>
          runGreenfieldGenerate(id, typeof prompt === "string" ? prompt : ""),
        );
      } catch (err) {
        console.error(
          "[greenfield] greenfield:generate failed:",
          err instanceof Error ? err.message : "unknown error",
        );
        return buildThrownGenerateResult(id, err);
      }
    },
  );

  ipcMain.handle(
    "greenfield:generate-raw",
    async (_event, provider: ProviderId, prompt: string, generationId?: unknown) => {
      const id =
        provider === "gemini" ||
        provider === "ollama" ||
        provider === "anthropic" ||
        provider === "groq" ||
        provider === "openrouter"
          ? provider
          : "ollama";
      const { runInProviderRequestScope } = await import(
        "./providers/providerRequestRegistry.cjs"
      );
      const scope = typeof generationId === "string" && generationId ? generationId : undefined;
      try {
        return await runInProviderRequestScope(scope, () =>
          runGreenfieldRawGenerate(id, typeof prompt === "string" ? prompt : ""),
        );
      } catch (err) {
        console.error(
          "[greenfield] greenfield:generate-raw failed:",
          err instanceof Error ? err.message : "unknown error",
        );
        return buildThrownGenerateResult(id, err);
      }
    },
  );

  ipcMain.handle(
    "greenfield:write",
    async (
      _event,
      root: string,
      files: GeneratedFile[],
      generationId?: unknown,
    ): Promise<
      | { ok: true; written: string[]; logs: import("./greenfield/write.cjs").WriteFileLogEntry[] }
      | {
          ok: false;
          written: string[];
          errors: string[];
          logs: import("./greenfield/write.cjs").WriteFileLogEntry[];
        }
      | { error: string; code?: typeof FOLDER_NOT_EMPTY_CODE }
    > => {
      try {
      const approved = rejectUnapprovedRoot(root);
      if (typeof approved !== "string") return approved;
      const settings = await loadRawSettings();
      const writeMode = settings.fileWriteMode ?? "workspace";
      const scope = typeof generationId === "string" && generationId ? generationId : undefined;
      const result = await handleGreenfieldWriteIpc({
        approvedRoot: approved,
        files: Array.isArray(files) ? files : [],
        ...(scope ? { generationId: scope } : {}),
        writeMode,
      });
      if ("error" in result) return result;
      if (result.ok) {
        await switchProjectRoot(approved);
        return { ok: true, written: result.written, logs: result.logs };
      }
      return {
        ok: false,
        written: result.written,
        errors: result.errors,
        logs: result.logs,
      };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Greenfield write failed.";
        console.warn(`[greenfield:write] write failed — ${message}`);
        return { error: message };
      }
    },
  );

  ipcMain.handle(
    "greenfield:nextNumberedFolder",
    async (_event, current: unknown) => {
      const approved = rejectUnapprovedRoot(current);
      if (typeof approved !== "string") return approved;
      try {
        const next = await findNextNumberedSiblingFolder(approved);
        await fs.mkdir(next, { recursive: true });
        approveWorkspaceRoot(next);
        return { path: next, name: path.basename(next) };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not create numbered folder.";
        return { error: message };
      }
    },
  );

  ipcMain.handle("greenfield:clearFolder", async (_event, root: unknown) => {
    const approved = rejectUnapprovedRoot(root);
    if (typeof approved !== "string") return approved;
    const cleared = await clearDirectoryContents(approved);
    if (!cleared.ok) return { error: cleared.error };
    return { ok: true as const };
  });

  ipcMain.handle("greenfield:setup", async (_event, root: string, generationId?: unknown) => {
    const approved = rejectUnapprovedRoot(root);
    if (typeof approved !== "string") return approved;
    const { runInProviderRequestScope } = await import(
      "./providers/providerRequestRegistry.cjs"
    );
    const scope = typeof generationId === "string" && generationId ? generationId : undefined;
    return runInProviderRequestScope(scope, () =>
      runGreenfieldSetup(approved, scope ? { generationId: scope } : undefined),
    );
  });

  ipcMain.handle("greenfield:typecheck", async (_event, root: string) => {
    const approved = rejectUnapprovedRoot(root);
    if (typeof approved !== "string") return approved;
    const typecheck = await runGreenfieldTypecheck(approved);
    const { buildTypeScriptCheckDetails } = await import(
      "./greenfield/tscDiagnostics.cjs"
    );
    return {
      typecheck,
      ...(typecheck.ok
        ? {}
        : { typecheckDetails: buildTypeScriptCheckDetails(typecheck) }),
    };
  });

  ipcMain.handle("greenfield:build", async (_event, root: string) => {
    const approved = rejectUnapprovedRoot(root);
    if (typeof approved !== "string") return approved;
    return { build: await runGreenfieldBuild(approved) };
  });

  ipcMain.handle(
    "greenfield:previewStart",
    async (_event, root: string, generationId?: unknown) => {
    const approved = rejectUnapprovedRoot(root);
    if (typeof approved !== "string") return { ok: false, error: approved.error };
    const scope = typeof generationId === "string" && generationId ? generationId : undefined;
    return startPreview(approved, scope ? { generationId: scope } : undefined);
  });

  ipcMain.handle("greenfield:previewStop", async () => {
    await stopPreviewAsync();
    return { ok: true };
  });

  ipcMain.handle("greenfield:previewState", async () => getPreviewState());

  ipcMain.handle("greenfield:previewProbe", async (_event, url: string) => {
    if (typeof url !== "string" || !isAllowedPreviewUrl(url)) {
      return {
        ok: false,
        httpStatus: null,
        contentType: null,
        error: "Invalid preview URL.",
        errorKind: "unknown" as const,
        probedAt: new Date().toISOString(),
      };
    }
    return probePreviewUrl(url);
  });

  ipcMain.handle("greenfield:uiAudit", async (_event, url: string) => {
    if (typeof url !== "string" || !isAllowedPreviewUrl(url)) {
      return {
        ok: false,
        snapshot: null,
        error: "Invalid preview URL for UI audit.",
      };
    }
    return auditGreenfieldPreviewUrl(url);
  });

  ipcMain.handle("greenfield:previewOpenExternal", async (_event, url: string) => {
    if (typeof url !== "string" || !isAllowedPreviewUrl(url)) {
      return { ok: false, error: "Invalid preview URL." };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  registerTerminalIpc(
    ipcMain,
    () => mainWindow,
    isExecutionPathWithinProject,
    () => projectRoot,
  );
  registerTerminalExecIpc(
    ipcMain,
    isExecutionPathWithinProject,
    () => projectRoot,
    () => mainWindow,
  );

  registerProjectGrepIpc(ipcMain, () => projectRoot);

  registerProjectIndexIpc(ipcMain, () => projectRoot);
  registerProjectProblemsIpc(ipcMain, () => projectRoot, () => mainWindow);

  registerSemanticIndexIpc(ipcMain, () => projectRoot);

  registerShadowWorkspaceIpc(ipcMain, () => projectRoot);

  registerMcpIpc({
    ipcMain,
    ctx: {
      getProjectRoot: () => projectRoot,
      isWithinProject,
      readFile: async (absPath) => {
        if (!isWithinProject(absPath)) {
          return { content: "", readable: false, reason: "Path is outside the project." };
        }
        try {
          const stat = await fs.stat(absPath);
          if (!stat.isFile()) {
            return { content: "", readable: false, reason: "Not a file." };
          }
          if (stat.size > MAX_FILE_BYTES) {
            return { content: "", readable: false, reason: "File is too large." };
          }
          const buffer = await fs.readFile(absPath);
          if (buffer.includes(0)) {
            return { content: "", readable: false, reason: "Binary file." };
          }
          return { content: buffer.toString("utf8"), readable: true };
        } catch {
          return { content: "", readable: false, reason: "Could not read file." };
        }
      },
      listDirectory: async (dirPath) => {
        if (!isWithinProject(dirPath)) return [];
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const nodes: FileNode[] = [];
        for (const entry of entries) {
          if (IGNORED_ENTRIES.has(entry.name)) continue;
          if (!entry.isFile() && !entry.isDirectory()) continue;
          nodes.push({
            name: entry.name,
            path: path.join(dirPath, entry.name),
            type: entry.isDirectory() ? "directory" : "file",
          });
        }
        nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return nodes;
      },
      scanProject: async () => {
        if (!projectRoot) return null;
        return getCachedProjectScan() ?? scanProject(projectRoot);
      },
      getGitStatus: async () => {
        if (!projectRoot) return null;
        return getGitStatus(projectRoot);
      },
      runVerification: async () => {
        if (!projectRoot || verifying) {
          return { ok: false, error: "Verification unavailable." };
        }
        verifying = true;
        try {
          return await runVerification(projectRoot);
        } finally {
          verifying = false;
        }
      },
      semanticSearch: (query, limit) => semanticSearch(query, limit),
    },
  });
}

console.log("[electron:startup] Electron app:", typeof app);
console.log("[electron:startup] process.type:", process.type);
console.log(
  "[electron:startup] ELECTRON_RUN_AS_NODE:",
  process.env.ELECTRON_RUN_AS_NODE ?? "(unset)",
);

if (!app || typeof app.whenReady !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronModule = require("electron") as unknown;
  console.error("[electron:startup] FATAL: electron.app is unavailable.");
  console.error(
    "[electron:startup] typeof require('electron'):",
    typeof electronModule,
  );
  if (process.env.ELECTRON_RUN_AS_NODE) {
    console.error(
      "[electron:startup] ELECTRON_RUN_AS_NODE is set — Electron is running as plain Node, not the desktop runtime.",
    );
    console.error(
      "[electron:startup] Fix: npm run electron:dev (clears it) or run: env -u ELECTRON_RUN_AS_NODE electron .",
    );
  }
  process.exit(1);
}

app.whenReady().then(async () => {
  registerIpcHandlers();

  await ensureProviderSecretsMigrated();
  await applyE2eRealProviderSettings();

  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(resolveAppIconPath());
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  const e2eProject = process.env.BRYANTLABS_E2E_PROJECT;
  if (e2eProject && typeof e2eProject === "string") {
    await switchProjectRoot(path.resolve(e2eProject));
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const quitTeardown = createQuitTeardownCoordinator({
  stopPreviewAsync,
  destroyAllTerminals,
  quit: () => app.quit(),
});

app.on("window-all-closed", () => {
  if (shouldQuitWhenAllWindowsClosed()) {
    app.quit();
    return;
  }
  // macOS may keep the app alive; do not force termination on last window close.
  stopPreview();
  destroyAllTerminals();
});

app.on("before-quit", (event) => {
  quitTeardown.intercept(event);
});

app.on("will-quit", (event) => {
  quitTeardown.intercept(event);
});
