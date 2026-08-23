import { groupForRunLogEntry } from "@/core/agent/agentLiveActivityTimeline";
import type { BuildAgentLiveActivityTimelineInput } from "@/core/agent/agentLiveActivityTimeline";
import { AGENT_COPY, pickWaitObservation } from "@/core/agent/agentExecutionCopy";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

export type AgentToolStatus = "running" | "success" | "failed";

export type AgentToolKind = "say" | "read" | "search" | "plan" | "generate" | "edit" | "run" | "wait" | "failure";

export interface AgentToolEvent {
  readonly id: string;
  readonly kind: AgentToolKind;
  readonly label: string;
  readonly status: AgentToolStatus;
  readonly at: number;
  readonly detail?: string;
  readonly files?: readonly string[];
}

export interface BuildAgentToolStreamInput extends BuildAgentLiveActivityTimelineInput {
  readonly scanFileCount?: number | null;
  readonly frameworkLabel?: string | null;
}

function entryTimestamp(entry: GreenfieldRunLogEntry): number {
  return Date.parse(entry.timestamp) || Date.now();
}

function mapStatus(status: GreenfieldRunLogEntry["status"]): AgentToolStatus {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "running";
}

function fileBaseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

function extractFilePath(text: string): string | null {
  const match =
    text.match(/(?:^|\s)([\w./-]+\.(?:tsx?|jsx?|css|json|html|md|vue|svelte))\b/i) ??
    text.match(/([\w./-]+\/[\w./-]+\.\w+)/);
  return match?.[1] ?? null;
}

function upsertTool(
  items: AgentToolEvent[],
  indexById: Map<string, number>,
  tool: AgentToolEvent,
): void {
  const idx = indexById.get(tool.id);
  if (idx != null) {
    const existing = items[idx]!;
    items[idx] = {
      ...existing,
      label: tool.label,
      status: tool.status,
      at: tool.at,
      kind: tool.kind,
      ...(tool.detail ?? existing.detail ? { detail: tool.detail ?? existing.detail } : {}),
      ...(tool.files ?? existing.files ? { files: tool.files ?? existing.files } : {}),
    };
    return;
  }
  indexById.set(tool.id, items.length);
  items.push(tool);
}

function consolidateEdits(
  items: AgentToolEvent[],
  indexById: Map<string, number>,
  filePaths: string[],
): void {
  const editItems = items.filter((item) => item.id.startsWith("edit:"));
  if (editItems.length === 0) return;

  for (const edit of editItems) {
    const idx = items.indexOf(edit);
    if (idx >= 0) items.splice(idx, 1);
    indexById.delete(edit.id);
  }

  const running = editItems.find((item) => item.status === "running");
  if (running) {
    upsertTool(items, indexById, {
      id: "edit:active",
      kind: "edit",
      label: AGENT_COPY.tools.edit(fileBaseName(running.id.slice("edit:".length))),
      status: "running",
      at: running.at,
    });
    return;
  }

  const paths = filePaths.length > 0 ? filePaths : editItems.map((item) => item.id.slice("edit:".length));
  if (paths.length === 0) return;

  const label =
    paths.length === 1
      ? AGENT_COPY.tools.edited(fileBaseName(paths[0]!))
      : AGENT_COPY.tools.editedMany(paths.length);

  upsertTool(items, indexById, {
    id: "edit:summary",
    kind: "edit",
    label,
    status: "success",
    at: Math.max(...editItems.map((item) => item.at)),
    ...(paths.length > 1 ? { files: paths } : {}),
  });
}

export function buildAgentToolStream(input: BuildAgentToolStreamInput): AgentToolEvent[] {
  const items: AgentToolEvent[] = [];
  const indexById = new Map<string, number>();
  const card = input.card;
  const filePaths: string[] = [];
  const startAt =
    input.entries[0] != null
      ? entryTimestamp(input.entries[0]) - 1
      : (input.nowMs ?? Date.now());

  upsertTool(items, indexById, {
    id: "say:intro",
    kind: "say",
    label: AGENT_COPY.boot,
    status: "success",
    at: startAt,
  });

  for (const entry of input.entries) {
    const group = groupForRunLogEntry(entry);
    if (!group) continue;
    const status = mapStatus(entry.status);
    const at = entryTimestamp(entry);
    const path = extractFilePath(entry.message) ?? extractFilePath(entry.details ?? "");

    if (group === "understanding_project" || group === "reading_files") {
      if (group === "understanding_project") {
        upsertTool(items, indexById, {
          id: "read:project",
          kind: "read",
          label:
            status === "success" && input.frameworkLabel
              ? `Found ${input.frameworkLabel} project`
              : AGENT_COPY.tools.readProject,
          status,
          at,
        });
      }
      if (group === "reading_files") {
        const count = input.scanFileCount;
        upsertTool(items, indexById, {
          id: "search:codebase",
          kind: "search",
          label:
            status === "success" && count != null && count > 0
              ? AGENT_COPY.tools.explore(count)
              : AGENT_COPY.tools.exploreGeneric,
          status,
          at,
        });
      }
      continue;
    }

    if (group === "planning_changes") {
      upsertTool(items, indexById, {
        id: "plan:main",
        kind: "plan",
        label: AGENT_COPY.tools.plan,
        status,
        at,
      });
      continue;
    }

    if (group === "calling_provider" || group === "generating_patches") {
      upsertTool(items, indexById, {
        id: "generate:main",
        kind: "generate",
        label: AGENT_COPY.tools.generate,
        status,
        at,
      });
      continue;
    }

    if ((group === "applying_patches" || entry.stage === "write") && path) {
      filePaths.push(path);
      upsertTool(items, indexById, {
        id: `edit:${path}`,
        kind: "edit",
        label:
          status === "success"
            ? AGENT_COPY.tools.edited(fileBaseName(path))
            : AGENT_COPY.tools.edit(fileBaseName(path)),
        status,
        at,
      });
      continue;
    }

    if (group === "running_typescript") {
      upsertTool(items, indexById, {
        id: "run:typescript",
        kind: "run",
        label: status === "success" ? AGENT_COPY.tools.typescriptDone : AGENT_COPY.tools.typescript,
        status,
        at,
      });
      continue;
    }

    if (group === "running_build") {
      upsertTool(items, indexById, {
        id: "run:build",
        kind: "run",
        label: status === "success" ? AGENT_COPY.tools.buildDone : AGENT_COPY.tools.build,
        status,
        at,
      });
      continue;
    }

    if (group === "starting_preview") {
      upsertTool(items, indexById, {
        id: "run:preview",
        kind: "run",
        label: status === "success" ? AGENT_COPY.tools.previewDone : AGENT_COPY.tools.preview,
        status,
        at,
      });
      continue;
    }

    if (group === "repairing_errors") {
      upsertTool(items, indexById, {
        id: "run:repair",
        kind: "run",
        label: AGENT_COPY.tools.repair,
        status,
        at,
      });
      continue;
    }

    if (entry.status === "failed") {
      if (
        entry.stage === "ui_audit" &&
        (card?.overallStatus === "complete" ||
          card?.verification.build === "passed" ||
          (card?.filesWritten?.length ?? 0) > 0 ||
          (card?.filesModified?.length ?? 0) > 0 ||
          input.entries.some(
            (later) => later.stage === "ui_audit" && later.status === "success",
          ) ||
          input.entries.some(
            (later) => later.stage === "write" && later.status === "success",
          ) ||
          input.entries.some(
            (later) => later.stage === "build" && later.status === "success",
          ))
      ) {
        continue;
      }
      const headline =
        card?.failureDetails?.headline ??
        (entry.stage === "apply_plan" ? AGENT_COPY.failure.patch : entry.message.trim()) ??
        AGENT_COPY.failure.default;
      const failureDetail = card?.failureDetails?.rawErrorMessage ?? entry.details?.trim();
      upsertTool(items, indexById, {
        id: `failure:${entry.id}`,
        kind: "failure",
        label: headline || AGENT_COPY.failure.default,
        status: "failed",
        at,
        ...(failureDetail ? { detail: failureDetail } : {}),
      });
    }
  }

  if (card?.fileActivity.length) {
    for (const file of card.fileActivity) {
      if (!filePaths.includes(file.path)) filePaths.push(file.path);
      const status: AgentToolStatus = file.status === "written" ? "success" : "running";
      upsertTool(items, indexById, {
        id: `edit:${file.path}`,
        kind: "edit",
        label:
          status === "success"
            ? AGENT_COPY.tools.edited(fileBaseName(file.path))
            : AGENT_COPY.tools.edit(fileBaseName(file.path)),
        status,
        at: input.nowMs ?? Date.now(),
      });
    }
  }

  consolidateEdits(items, indexById, filePaths);

  const providerWaiting = [...input.entries]
    .reverse()
    .find(
      (entry) =>
        (groupForRunLogEntry(entry) === "calling_provider" ||
          groupForRunLogEntry(entry) === "generating_patches") &&
        entry.status === "running",
    );

  if (providerWaiting && card?.overallStatus === "running") {
    const at = entryTimestamp(providerWaiting);
    const elapsed = (input.nowMs ?? Date.now()) - at;
    upsertTool(items, indexById, {
      id: "wait:provider",
      kind: "wait",
      label: pickWaitObservation(elapsed),
      status: "running",
      at,
    });
  } else {
    const waitIdx = indexById.get("wait:provider");
    if (waitIdx != null) {
      items.splice(waitIdx, 1);
      indexById.delete("wait:provider");
    }
  }

  if (card?.overallStatus === "failed" && !items.some((item) => item.kind === "failure")) {
    upsertTool(items, indexById, {
      id: "failure:terminal",
      kind: "failure",
      label: card.failureDetails?.headline ?? card.summary ?? AGENT_COPY.failure.default,
      status: "failed",
      at: input.nowMs ?? Date.now(),
      ...(card.failureDetails?.rawErrorMessage
        ? { detail: card.failureDetails.rawErrorMessage }
        : {}),
    });
  } else if (input.run?.runResult === "cancelled") {
    upsertTool(items, indexById, {
      id: "failure:cancelled",
      kind: "failure",
      label: AGENT_COPY.failure.cancelled,
      status: "failed",
      at: input.nowMs ?? Date.now(),
    });
  }

  return items.sort((a, b) => a.at - b.at);
}

export function mergeAgentToolEvents(
  previous: readonly AgentToolEvent[],
  next: readonly AgentToolEvent[],
): AgentToolEvent[] {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return next.map((item) => {
    const old = previousById.get(item.id);
    if (
      old &&
      old.status === item.status &&
      old.label === item.label &&
      old.detail === item.detail &&
      old.files === item.files
    ) {
      return old;
    }
    return item;
  });
}