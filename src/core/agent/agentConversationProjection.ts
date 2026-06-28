import type { AgentRunFinalSummary } from "@/core/agent/agentLiveActivityTimeline";
import type { AgentToolEvent, AgentToolStatus } from "@/core/agent/agentToolStream";
import { AGENT_COPY, pickWaitObservation } from "@/core/agent/agentExecutionCopy";

export interface AgentNarrativeSegment {
  readonly id: string;
  readonly text: string;
}

export interface AgentInlineAction {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly detail?: string;
  readonly status: AgentToolStatus;
}

export interface AgentConversationProjection {
  readonly segments: readonly AgentNarrativeSegment[];
  readonly waitSuffix: string | null;
  readonly actions: readonly AgentInlineAction[];
  readonly activeActionId: string | null;
}

interface NarrationMemory {
  projectRead: boolean;
  explored: boolean;
  planned: boolean;
  generated: boolean;
  editedFiles: string[];
  verified: boolean;
  built: boolean;
  previewed: boolean;
  frameworkLabel: string | null;
  primaryFile: string | null;
}

interface ToolIntents {
  readonly running?: string;
  readonly done?: string;
}

function fileBaseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

function extractPrimaryFile(tool: AgentToolEvent): string | null {
  if (tool.files?.[0]) return fileBaseName(tool.files[0]);
  const match = tool.label.match(/([\w.-]+\.(?:tsx?|jsx?|css|json|html|md))/i);
  return match?.[1] ?? null;
}

function ellipsis(text: string): string {
  return text.endsWith("…") ? text : `${text.replace(/\.$/, "")}…`;
}

function iconForAction(tool: AgentToolEvent): string {
  switch (tool.kind) {
    case "read":
      return "📂";
    case "search":
      return "🔍";
    case "plan":
      return "📝";
    case "generate":
      return "⚡";
    case "edit":
      return "📄";
    case "run":
      if (tool.id.includes("typescript")) return "🛠";
      if (tool.id.includes("build")) return "🏗";
      if (tool.id.includes("preview")) return "🚀";
      return "▶";
    default:
      return "•";
  }
}

function compactLabelForTool(tool: AgentToolEvent): string | null {
  if (tool.kind === "say" || tool.kind === "wait" || tool.kind === "failure") return null;

  switch (tool.id) {
    case "read:project":
      return "Project reviewed";
    case "search:codebase":
      return "Codebase explored";
    case "plan:main":
      return "Change scoped";
    case "generate:main":
      return "Edits prepared";
    case "edit:active":
    case "edit:summary": {
      const file = extractPrimaryFile(tool);
      if (file) return `${file} updated`;
      if (tool.files?.length === 1) return `${fileBaseName(tool.files[0]!)} updated`;
      if (tool.files && tool.files.length > 1) return `${tool.files.length} files updated`;
      return "Files updated";
    }
    case "run:typescript":
      return "TypeScript checked";
    case "run:build":
      return "Build completed";
    case "run:preview":
      return "Preview ready";
    case "run:repair":
      return "Errors repaired";
    default: {
      if (tool.kind === "edit") {
        const file = extractPrimaryFile(tool);
        return file ? `${file} updated` : "Files updated";
      }
      return null;
    }
  }
}

function intentsForTool(tool: AgentToolEvent, mem: NarrationMemory): ToolIntents | null {
  const file = extractPrimaryFile(tool) ?? mem.primaryFile;

  switch (tool.id) {
    case "read:project":
      return {
        running: ellipsis("I'm looking through the project"),
        done: mem.frameworkLabel
          ? `I've finished reading the project — it's a ${mem.frameworkLabel} app.`
          : "I've finished reading the project.",
      };
    case "search:codebase":
      return {
        running: mem.projectRead
          ? ellipsis("I'm checking for anything else that depends on it")
          : ellipsis("I'm exploring the codebase"),
        done: "Everything looks isolated.",
      };
    case "plan:main":
      return {
        running: mem.explored || mem.projectRead
          ? ellipsis("I'm tracing how this feature is connected")
          : ellipsis("I'm finding where this needs to change"),
        done: file
          ? `I found the ${file.replace(/\.\w+$/, "")} implementation.`
          : "I found where this needs to change.",
      };
    case "generate:main":
      return {
        running: ellipsis("I'm still generating the implementation"),
        done: "I've prepared the edits.",
      };
    case "edit:active":
    case "edit:summary": {
      if (file) mem.primaryFile = file;
      return {
        running: ellipsis(`I'm updating ${file ?? "the files"} now`),
        done: file ? `I'm done updating ${file}.` : "I'm done applying the edits.",
      };
    }
    case "run:typescript":
      return {
        running: ellipsis("Checking everything still works"),
        done: "TypeScript still looks good.",
      };
    case "run:build":
      return {
        running: ellipsis("I'm running a build to make sure nothing broke"),
        done: "Everything builds successfully.",
      };
    case "run:preview":
      return {
        running: ellipsis("I'm launching the preview"),
        done: "The preview is ready.",
      };
    case "run:repair":
      return {
        running: ellipsis("I'm fixing an issue that came up"),
        done: "I've cleared the issue.",
      };
    default: {
      if (tool.kind === "edit" && file) {
        return {
          running: ellipsis(`I'm updating ${file}`),
          done: `I'm done updating ${file}.`,
        };
      }
      return null;
    }
  }
}

function applyToolMemory(tool: AgentToolEvent, mem: NarrationMemory): void {
  const file = extractPrimaryFile(tool) ?? mem.primaryFile;
  switch (tool.id) {
    case "read:project":
      if (tool.status === "success") mem.projectRead = true;
      break;
    case "search:codebase":
      if (tool.status === "success") mem.explored = true;
      break;
    case "plan:main":
      if (tool.status === "success") mem.planned = true;
      break;
    case "generate:main":
      if (tool.status === "success") mem.generated = true;
      break;
    case "run:typescript":
      if (tool.status === "success") mem.verified = true;
      break;
    case "run:build":
      if (tool.status === "success") mem.built = true;
      break;
    case "run:preview":
      if (tool.status === "success") mem.previewed = true;
      break;
    default:
      if (tool.kind === "edit" && file && tool.status === "success" && !mem.editedFiles.includes(file)) {
        mem.editedFiles.push(file);
      }
      break;
  }
  if (
    (tool.id === "edit:active" || tool.id === "edit:summary") &&
    file &&
    tool.status === "success" &&
    !mem.editedFiles.includes(file)
  ) {
    mem.editedFiles.push(file);
  }
}

function pushSegment(
  segments: AgentNarrativeSegment[],
  narrated: Set<string>,
  id: string,
  text: string,
): void {
  if (narrated.has(id)) return;
  narrated.add(id);
  segments.push({ id, text });
}

function buildClosingSegments(input: {
  readonly summary: AgentRunFinalSummary;
  readonly previewReady: boolean;
  readonly skipLeadIn?: boolean;
}): AgentNarrativeSegment[] {
  const { summary, previewReady, skipLeadIn = false } = input;
  const segments: AgentNarrativeSegment[] = [];

  if (summary.outcome === "cancelled") {
    segments.push({ id: "closing:0", text: "I stopped before finishing this request." });
    return segments;
  }

  if (summary.outcome === "failed") {
    if (!skipLeadIn) {
      const reason = summary.errors[0] ?? summary.noChangeExplanation;
      if (reason) {
        const normalized = reason.startsWith("I ")
          ? reason
          : `I couldn't safely apply this edit because ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
        segments.push({ id: "closing:0", text: normalized });
      } else {
        segments.push({
          id: "closing:0",
          text: "I couldn't safely apply this edit because the generated patch wasn't valid.",
        });
      }
    }
    if (summary.filesChanged.length === 0) {
      segments.push({
        id: "closing:files",
        text: "The existing files weren't modified.",
      });
    }
    return segments;
  }

  if (summary.noChangeExplanation) {
    segments.push({ id: "closing:0", text: summary.noChangeExplanation });
    return segments;
  }

  const sentences: string[] = [];
  if (summary.filesChanged.length === 1) {
    const file = fileBaseName(summary.filesChanged[0]!);
    const feature = file.replace(/\.\w+$/, "");
    sentences.push(`The ${feature} has been added successfully.`);
  } else if (summary.filesChanged.length > 1) {
    sentences.push(`All ${summary.filesChanged.length} files have been updated successfully.`);
  }

  let tail = "Everything builds cleanly";
  if (previewReady) tail += " and the preview is ready";
  sentences.push(`${tail}.`);

  if (sentences.length === 0) {
    sentences.push("All set — let me know if you want to tweak anything.");
  }

  segments.push({
    id: "closing:0",
    text: sentences.join(" "),
  });
  return segments;
}

export interface BuildAgentConversationProjectionInput {
  readonly tools: readonly AgentToolEvent[];
  readonly summary: AgentRunFinalSummary | null;
  readonly previewReady?: boolean;
  readonly frameworkLabel?: string | null;
  readonly isRunning: boolean;
  readonly waitElapsedMs?: number;
}

export function buildAgentConversationProjection(
  input: BuildAgentConversationProjectionInput,
): AgentConversationProjection {
  const mem: NarrationMemory = {
    projectRead: false,
    explored: false,
    planned: false,
    generated: false,
    editedFiles: [],
    verified: false,
    built: false,
    previewed: false,
    frameworkLabel: input.frameworkLabel?.trim() ?? null,
    primaryFile: null,
  };

  const segments: AgentNarrativeSegment[] = [];
  const actions: AgentInlineAction[] = [];
  const narrated = new Set<string>();
  let providerWaiting = false;

  const workTools = input.tools.filter((tool) => tool.kind !== "say");
  const failureTools = workTools.filter((tool) => tool.kind === "failure");
  const activityTools = workTools.filter((tool) => tool.kind !== "failure");

  if (input.isRunning && activityTools.filter((t) => t.kind !== "wait").length === 0) {
    pushSegment(segments, narrated, "intent:boot", AGENT_COPY.boot);
  }

  for (const tool of activityTools) {
    if (tool.kind === "wait") {
      providerWaiting = tool.status === "running";
      continue;
    }

    const compact = compactLabelForTool(tool);
    if (compact) {
      actions.push({
        id: tool.id,
        icon: iconForAction(tool),
        label: compact,
        status: tool.status,
        ...(tool.detail ? { detail: tool.detail } : {}),
      });
    }

    const intents = intentsForTool(tool, mem);
    if (intents) {
      if (tool.status === "running" && intents.running) {
        pushSegment(segments, narrated, `thought:${tool.id}:running`, intents.running);
      }
      if (tool.status === "success") {
        if (intents.running && intents.done) {
          pushSegment(
            segments,
            narrated,
            `thought:${tool.id}:running`,
            intents.running.replace(/…$/, "."),
          );
        }
        const doneText =
          intents.done ?? (intents.running ? intents.running.replace(/…$/, ".") : null);
        if (doneText) {
          pushSegment(segments, narrated, `thought:${tool.id}:done`, doneText);
        }
      }
    }

    applyToolMemory(tool, mem);
  }

  for (const tool of failureTools) {
    const line = tool.label.startsWith("I ")
      ? tool.label
      : `I couldn't safely apply this edit because ${tool.label.charAt(0).toLowerCase()}${tool.label.slice(1)}.`;
    pushSegment(segments, narrated, `thought:${tool.id}`, line);
    if (tool.detail) {
      actions.push({
        id: `${tool.id}:detail`,
        icon: "✕",
        label: "Error details",
        status: "failed",
        detail: tool.detail,
      });
    }
  }

  if (!input.isRunning && input.summary) {
    const closing = buildClosingSegments({
      summary: input.summary,
      previewReady: input.previewReady ?? false,
      skipLeadIn: failureTools.length > 0 && input.summary.outcome === "failed",
    });
    for (const segment of closing) {
      pushSegment(segments, narrated, segment.id, segment.text);
    }
  }

  const activeAction =
    [...actions].reverse().find((action) => action.status === "running") ?? null;

  const waitSuffix =
    providerWaiting && input.isRunning
      ? pickWaitObservation(input.waitElapsedMs ?? 0)
      : null;

  return {
    segments,
    waitSuffix,
    actions,
    activeActionId: activeAction?.id ?? null,
  };
}

export function narrativeTargetText(
  segments: readonly AgentNarrativeSegment[],
  waitSuffix: string | null,
): string {
  const body = segments.map((segment) => segment.text).join("\n\n");
  if (!waitSuffix) return body;
  return body.length > 0 ? `${body}\n\n${waitSuffix}` : waitSuffix;
}
