import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

/**
 * Preload script (Phase 2).
 *
 * Exposes a minimal, read-only bridge to the renderer. Every method is a thin
 * wrapper over an ipcRenderer.invoke call — there is no write access, no shell,
 * and no direct Node exposure.
 */
const api = {
  phase: 2,
  isDesktop: true,

  openProject: () => ipcRenderer.invoke("project:open"),
  openProjectAt: (folderPath: string) =>
    ipcRenderer.invoke("project:openAt", folderPath),
  listDirectory: (dirPath: string) =>
    ipcRenderer.invoke("fs:listDirectory", dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke("fs:readFile", filePath),
  loadProjectInstructionPack: () => ipcRenderer.invoke("fs:loadProjectInstructionPack"),
  scanProject: () => ipcRenderer.invoke("project:scan"),
  getProjectIndexStatus: () => ipcRenderer.invoke("project:index-status"),
  rescanProject: () => ipcRenderer.invoke("project:rescan"),
  onProjectIndexUpdated: (
    handler: (event: {
      changedPaths: string[];
      deletedPaths: string[];
      builtAt: number;
    }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: { changedPaths: string[]; deletedPaths: string[]; builtAt: number },
    ) => {
      handler(payload);
    };
    ipcRenderer.on("project:index-updated", listener);
    return () => ipcRenderer.removeListener("project:index-updated", listener);
  },
  onProjectIndexStatus: (
    handler: (status: {
      state: "ready" | "updating" | "stale";
      pendingFiles: number;
      coverage: number | null;
      builtAt: number | null;
      fromCache: boolean;
    }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: {
        state: "ready" | "updating" | "stale";
        pendingFiles: number;
        coverage: number | null;
        builtAt: number | null;
        fromCache: boolean;
      },
    ) => {
      handler(payload);
    };
    ipcRenderer.on("project:index-status", listener);
    return () => ipcRenderer.removeListener("project:index-status", listener);
  },
  onSemanticIndexUpdated: (handler: (event: { builtAt: number }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: { builtAt: number }) => {
      handler(payload);
    };
    ipcRenderer.on("semantic:index-updated", listener);
    return () => ipcRenderer.removeListener("semantic:index-updated", listener);
  },
  getProjectProblemsStatus: () => ipcRenderer.invoke("project:problems-status"),
  refreshProjectProblems: () => ipcRenderer.invoke("project:problems-refresh"),
  onProjectProblemsUpdated: (
    handler: (status: {
      state: "idle" | "scanning" | "ready" | "stale";
      problems: Array<{
        file: string;
        absFile: string;
        line: number;
        column: number;
        code: string;
        message: string;
        severity: "error" | "warning";
        source: "typescript";
      }>;
      ranAt: number | null;
      error: string | null;
      errorCount: number;
      warningCount: number;
    }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: {
        state: "idle" | "scanning" | "ready" | "stale";
        problems: Array<{
          file: string;
          absFile: string;
          line: number;
          column: number;
          code: string;
          message: string;
          severity: "error" | "warning";
          source: "typescript";
        }>;
        ranAt: number | null;
        error: string | null;
        errorCount: number;
        warningCount: number;
      },
    ) => {
      handler(payload);
    };
    ipcRenderer.on("project:problems-updated", listener);
    return () => ipcRenderer.removeListener("project:problems-updated", listener);
  },
  readProjectMemory: () => ipcRenderer.invoke("project:memory:read"),
  writeProjectMemory: (memory: unknown) =>
    ipcRenderer.invoke("project:memory:write", memory),
  readAgentMemory: () => ipcRenderer.invoke("project:agentMemory:read"),
  writeAgentMemory: (store: unknown) =>
    ipcRenderer.invoke("project:agentMemory:write", store),
  readSessionMemory: () => ipcRenderer.invoke("project:sessionMemory:read"),
  writeSessionMemory: (memory: unknown) =>
    ipcRenderer.invoke("project:sessionMemory:write", memory),
  readFeatureInventory: () => ipcRenderer.invoke("project:features:read"),
  writeFeatureInventory: (inventory: unknown) =>
    ipcRenderer.invoke("project:features:write", inventory),
  loadRunCheckpoint: (projectPath: string) =>
    ipcRenderer.invoke("runCheckpoint:load", projectPath),
  saveRunCheckpoint: (checkpoint: unknown) =>
    ipcRenderer.invoke("runCheckpoint:save", checkpoint),
  clearRunCheckpoint: (projectPath: string) =>
    ipcRenderer.invoke("runCheckpoint:clear", projectPath),
  getGitBranch: () => ipcRenderer.invoke("project:gitBranch"),
  getGitStatus: () => ipcRenderer.invoke("git:status"),
  getGitDiffContents: (relPath: string) =>
    ipcRenderer.invoke("git:diffContents", relPath),
  gitStage: (paths: string[]) => ipcRenderer.invoke("git:stage", paths),
  gitUnstage: (paths: string[]) => ipcRenderer.invoke("git:unstage", paths),
  gitRestore: (paths: string[]) => ipcRenderer.invoke("git:restore", paths),
  gitCommit: (message: string) => ipcRenderer.invoke("git:commit", message),
  gitPushPreflight: () => ipcRenderer.invoke("git:pushPreflight"),
  gitPushExecute: (token: string) => ipcRenderer.invoke("git:pushExecute", token),
  gitPushCancel: (token: string) => ipcRenderer.invoke("git:pushCancel", token),
  gitListLocalBranches: () => ipcRenderer.invoke("git:listLocalBranches"),
  gitBranchPreflight: (payload: { op: "create" | "switch"; destination: string }) =>
    ipcRenderer.invoke("git:branchPreflight", payload),
  gitBranchExecute: (token: string) => ipcRenderer.invoke("git:branchExecute", token),
  gitBranchCancel: (token: string) => ipcRenderer.invoke("git:branchCancel", token),
  gitListWorktrees: () => ipcRenderer.invoke("git:worktreeList"),
  gitWorktreeCreatePreflight: (payload: { destinationBranch: string }) =>
    ipcRenderer.invoke("git:worktreeCreatePreflight", payload),
  gitWorktreeCreateExecute: (token: string) => ipcRenderer.invoke("git:worktreeCreateExecute", token),
  gitWorktreeRemovePreflight: (payload: { id: string }) =>
    ipcRenderer.invoke("git:worktreeRemovePreflight", payload),
  gitWorktreeRemoveExecute: (token: string) => ipcRenderer.invoke("git:worktreeRemoveExecute", token),
  gitWorktreeCancel: (token: string) => ipcRenderer.invoke("git:worktreeCancel", token),
  gitWorktreeOpen: (payload: { id: string }) => ipcRenderer.invoke("git:worktreeOpen", payload),
  applyEdit: (
    filePath: string,
    expectedBefore: string,
    after: string,
    recordUndo?: boolean,
  ) => ipcRenderer.invoke("edit:apply", filePath, expectedBefore, after, recordUndo),
  createProjectFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("edit:createFile", filePath, content),
  deleteProjectFile: (filePath: string) =>
    ipcRenderer.invoke("edit:deleteFile", filePath),
  replaceUndoBatch: (
    entries: readonly {
      path: string;
      previousContent: string;
      created: boolean;
    }[],
  ) => ipcRenderer.invoke("edit:replaceUndoBatch", entries),
  undoLastEdit: () => ipcRenderer.invoke("edit:undoLast"),
  verify: () => ipcRenderer.invoke("verify:run"),

  getMcpStatus: () => ipcRenderer.invoke("mcp:status"),
  listMcpTools: () => ipcRenderer.invoke("mcp:listTools"),
  invokeMcpTool: (tool: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke("mcp:invokeTool", tool, args),
  getSemanticIndexStatus: () => ipcRenderer.invoke("semanticIndex:status"),
  hydrateSemanticIndex: () => ipcRenderer.invoke("semanticIndex:hydrate"),
  rebuildSemanticIndex: () => ipcRenderer.invoke("semanticIndex:rebuild"),
  semanticSearch: (query: string, limit?: number) =>
    ipcRenderer.invoke("semanticIndex:search", query, limit),
  grepProject: (pattern: string, limit?: number) =>
    ipcRenderer.invoke("project:grep", pattern, limit),

  getProviderSettings: () => ipcRenderer.invoke("providers:getSettings"),
  saveProviderSettings: (input: unknown) =>
    ipcRenderer.invoke("providers:saveSettings", input),
  revealProviderApiKey: (provider: string) =>
    ipcRenderer.invoke("providers:revealApiKey", provider),
  checkProviderHealth: (provider: string) =>
    ipcRenderer.invoke("providers:health", provider),
  testProvider: (provider: string, prompt: string) =>
    ipcRenderer.invoke("providers:test", provider, prompt),
  agentStepWithProvider: (provider: string, prompt: string) =>
    ipcRenderer.invoke("providers:agentStep", provider, prompt),
  planWithProvider: (provider: string, prompt: string, context: unknown) =>
    ipcRenderer.invoke("providers:plan", provider, prompt, context),
  cancelActiveProviderRequests: (scope?: string) =>
    ipcRenderer.invoke("providers:cancelActive", scope),
  discardShadowRun: (runId: string) => ipcRenderer.invoke("shadow:discard", runId),
  proposePatch: (
    provider: string,
    prompt: string,
    context: unknown,
    file: unknown,
    symbols: unknown,
    planMeta?: { planSummary: string; fileReason: string },
  ) =>
    ipcRenderer.invoke(
      "providers:patch",
      provider,
      prompt,
      context,
      file,
      symbols,
      planMeta,
    ),
  proposeApplyPlanPatchesJson: (payloadJson: string) => {
    if (typeof payloadJson !== "string") {
      return Promise.resolve({
        ok: false,
        provider: "anthropic",
        model: "",
        raw: null,
        latencyMs: 0,
        error: "proposeApplyPlanPatchesJson requires a JSON string.",
        missingPaths: [],
      });
    }
    return ipcRenderer.invoke("providers:applyPlanBatchJson", payloadJson);
  },
  proposeApplyPlanPatches: (
    provider: string,
    prompt: string,
    context: unknown,
    files: unknown,
    meta?: {
      planSummary: string;
      targetPaths: string[];
      repair?: boolean;
      slimContext?: boolean;
      repairMissingPaths?: string[];
      directRewrite?: boolean;
    },
  ) =>
    ipcRenderer.invoke(
      "providers:applyPlanBatch",
      provider,
      prompt,
      context,
      files,
      meta,
    ),
  proposeAutoFix: (provider: string, context: unknown, file: unknown) =>
    ipcRenderer.invoke("providers:autoFix", provider, context, file),

  greenfieldSelectFolder: () => ipcRenderer.invoke("greenfield:selectFolder"),
  greenfieldGenerate: (provider: string, prompt: string, generationId?: string) =>
    ipcRenderer.invoke("greenfield:generate", provider, prompt, generationId),
  greenfieldGenerateRaw: (provider: string, prompt: string, generationId?: string) =>
    ipcRenderer.invoke("greenfield:generate-raw", provider, prompt, generationId),
  greenfieldWrite: (root: string, files: unknown, generationId?: string) =>
    ipcRenderer.invoke("greenfield:write", root, files, generationId),
  greenfieldNextNumberedFolder: (current: string) =>
    ipcRenderer.invoke("greenfield:nextNumberedFolder", current),
  greenfieldClearFolder: (root: string) =>
    ipcRenderer.invoke("greenfield:clearFolder", root),
  greenfieldSetup: (root: string, generationId?: string) =>
    ipcRenderer.invoke("greenfield:setup", root, generationId),
  greenfieldTypecheck: (root: string) =>
    ipcRenderer.invoke("greenfield:typecheck", root),
  greenfieldBuild: (root: string) => ipcRenderer.invoke("greenfield:build", root),
  greenfieldPreviewStart: (root: string, generationId?: string) =>
    ipcRenderer.invoke("greenfield:previewStart", root, generationId),
  greenfieldPreviewStop: () => ipcRenderer.invoke("greenfield:previewStop"),
  greenfieldPreviewState: () => ipcRenderer.invoke("greenfield:previewState"),
  greenfieldPreviewProbe: (url: string) =>
    ipcRenderer.invoke("greenfield:previewProbe", url),
  greenfieldPreviewOpenExternal: (url: string) =>
    ipcRenderer.invoke("greenfield:previewOpenExternal", url),
  greenfieldUiAudit: (url: string) => ipcRenderer.invoke("greenfield:uiAudit", url),

  terminalCreate: (cwd: string, cols?: number, rows?: number) =>
    ipcRenderer.invoke("terminal:create", cwd, cols, rows),
  terminalWrite: (id: string, data: string) =>
    ipcRenderer.invoke("terminal:write", id, data),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke("terminal:resize", id, cols, rows),
  terminalKill: (id: string) => ipcRenderer.invoke("terminal:kill", id),
  executeAgentInspect: (payload: unknown) => ipcRenderer.invoke("agent:inspect", payload),
  getAgentExecutionPolicy: () => ipcRenderer.invoke("agent:executionPolicy"),
  getAgentExecutionDenials: () => ipcRenderer.invoke("agent:executionDenials"),
  getAgentExecutionApprovals: () => ipcRenderer.invoke("agent:executionApprovals"),
  prepareProjectCodeExecution: (payload: unknown) => ipcRenderer.invoke("agent:projectCodePrepare", payload),
  approveProjectCodeExecution: (previewId: unknown) => ipcRenderer.invoke("agent:projectCodeApprove", previewId),
  executeApprovedProjectCode: (payload: unknown) => ipcRenderer.invoke("agent:projectCodeExecute", payload),
  confirmProjectCodeExecution: (previewId: unknown) => ipcRenderer.invoke("agent:projectCodeConfirm", previewId),
  cancelProjectCodeExecution: (payload: unknown) => ipcRenderer.invoke("agent:projectCodeCancel", payload),
  preparePackageScriptExecution: (payload: unknown) => ipcRenderer.invoke("agent:packageScriptPrepare", payload),
  approvePackageScriptExecution: (previewId: unknown) => ipcRenderer.invoke("agent:packageScriptApprove", previewId),
  executeApprovedPackageScript: (payload: unknown) => ipcRenderer.invoke("agent:packageScriptExecute", payload),
  confirmPackageScriptExecution: (previewId: unknown) => ipcRenderer.invoke("agent:packageScriptConfirm", previewId),
  cancelPackageScriptExecution: (payload: unknown) => ipcRenderer.invoke("agent:packageScriptCancel", payload),
  onTerminalData: (handler: (payload: { id: string; data: string }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: { id: string; data: string }) => {
      handler(payload);
    };
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit: (handler: (payload: { id: string; exitCode: number }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: { id: string; exitCode: number }) => {
      handler(payload);
    };
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  },
};

contextBridge.exposeInMainWorld("bryantlabs", api);
