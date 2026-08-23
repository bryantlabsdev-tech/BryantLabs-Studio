import type { ReferencedFileContent } from "@/core/context/referencedFileContext";
import type { InlineEditSelection } from "@/core/editor/inlineEdit";
import { parseComposerMentions } from "@/core/agent/composerMentions";
import type { ProjectScan } from "@/types";

const STORAGE_KEY = "bryantlabs.includeActiveEditorContext";
const MAX_ACTIVE_FILE_CHARS = 12_000;
const MAX_SELECTION_CHARS = 4_000;

export const ACTIVE_EDITOR_CONTEXT_EVENT = "bryantlabs:active-editor-context";

export interface ActiveEditorContext {
  readonly relPath: string;
  readonly absPath: string;
  readonly content: string;
  readonly selection: InlineEditSelection | null;
  readonly updatedAt: number;
}

export function readIncludeActiveEditorContext(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeIncludeActiveEditorContext(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function publishActiveEditorContext(context: ActiveEditorContext | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ACTIVE_EDITOR_CONTEXT_EVENT, { detail: context }),
  );
}

export function formatActiveSelectionBlock(selection: InlineEditSelection): string {
  const text =
    selection.text.length > MAX_SELECTION_CHARS
      ? `${selection.text.slice(0, MAX_SELECTION_CHARS)}\n…`
      : selection.text;
  return [
    `Active selection in ${selection.relPath} (lines ${selection.startLine}-${selection.endLine}):`,
    "```",
    text,
    "```",
  ].join("\n");
}

export function buildActiveEditorReferencedContent(
  context: ActiveEditorContext | null,
): ReferencedFileContent | null {
  if (!context?.relPath.trim()) return null;
  const content =
    context.content.length > MAX_ACTIVE_FILE_CHARS
      ? `${context.content.slice(0, MAX_ACTIVE_FILE_CHARS)}\n…`
      : context.content;
  const selectionBlock = context.selection
    ? `\n\n${formatActiveSelectionBlock(context.selection)}`
    : "";
  return {
    path: context.relPath,
    content: `${content}${selectionBlock}`,
  };
}

export function promptMentionsPath(prompt: string, relPath: string): boolean {
  const normalized = relPath.replace(/^[/\\]+/, "");
  const base = normalized.split("/").pop() ?? normalized;
  return parseComposerMentions(prompt).some((mention) => {
    const m = mention.replace(/^[/\\]+/, "");
    return m === normalized || m === base || normalized.endsWith(`/${m}`);
  });
}

export function mergeActiveEditorPath(
  paths: readonly string[],
  activeRelPath: string | null | undefined,
  prompt: string,
): string[] {
  if (!activeRelPath?.trim()) return [...paths];
  if (promptMentionsPath(prompt, activeRelPath)) return [...paths];
  if (paths.includes(activeRelPath)) return [...paths];
  return [activeRelPath, ...paths];
}

export function mergeActiveEditorReferencedContents(
  existing: readonly ReferencedFileContent[],
  context: ActiveEditorContext | null,
  prompt: string,
): readonly ReferencedFileContent[] {
  if (!readIncludeActiveEditorContext()) return existing;
  const active = buildActiveEditorReferencedContent(context);
  if (!active) return existing;
  if (promptMentionsPath(prompt, active.path)) return existing;
  const filtered = existing.filter((entry) => entry.path !== active.path);
  return [active, ...filtered];
}

export function resolveActiveEditorRelPath(
  context: ActiveEditorContext | null,
  scan: ProjectScan | null,
): string | null {
  if (!context?.relPath || !scan) return null;
  if (scan.files.some((f) => f.path === context.relPath)) return context.relPath;
  return null;
}
