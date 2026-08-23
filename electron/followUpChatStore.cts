import * as path from "node:path";
import { promises as fs } from "node:fs";
import { writeBryantlabsJson } from "./safeFs.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

const CHAT_FILE = "follow-up-chat.json";

export interface FollowUpChatDiskMessage {
  id: string;
  role: "user" | "studio";
  text: string;
  at: number;
  runId?: string;
  outcome?: "success" | "failure" | "neutral";
  filesModified?: string[];
  provider?: string;
  model?: string;
  durationMs?: number;
  suggestedNextSteps?: string[];
}

export interface FollowUpChatDiskRecord {
  version: 1;
  projectPath: string;
  updatedAt: number;
  messages: FollowUpChatDiskMessage[];
}

function chatPath(projectRoot: string): string {
  return path.join(projectRoot, ".bryantlabs", CHAT_FILE);
}

export function emptyFollowUpChat(projectPath: string): FollowUpChatDiskRecord {
  return {
    version: 1,
    projectPath,
    updatedAt: Date.now(),
    messages: [],
  };
}

function isMessage(value: unknown): value is FollowUpChatDiskMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as FollowUpChatDiskMessage;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "studio") &&
    typeof m.text === "string" &&
    typeof m.at === "number"
  );
}

export function normalizeFollowUpChatRecord(
  raw: unknown,
  projectPath: string,
): FollowUpChatDiskRecord {
  const base = emptyFollowUpChat(projectPath);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<FollowUpChatDiskRecord>;
  const messages = Array.isArray(data.messages) ? data.messages.filter(isMessage) : [];
  return {
    version: 1,
    projectPath,
    updatedAt:
      typeof data.updatedAt === "number" && data.updatedAt > 0 ? data.updatedAt : Date.now(),
    messages: messages.slice(-100),
  };
}

export async function readFollowUpChat(
  projectRoot: string,
): Promise<FollowUpChatDiskRecord> {
  try {
    const raw = await fs.readFile(chatPath(projectRoot), "utf8");
    return normalizeFollowUpChatRecord(JSON.parse(raw), projectRoot);
  } catch {
    return emptyFollowUpChat(projectRoot);
  }
}

export async function writeFollowUpChat(
  projectRoot: string,
  messages: readonly FollowUpChatDiskMessage[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!isActiveProjectRoot(projectRoot)) {
    return { ok: false, reason: "Project is no longer active." };
  }
  const payload: FollowUpChatDiskRecord = {
    version: 1,
    projectPath: projectRoot,
    updatedAt: Date.now(),
    messages: messages.filter(isMessage).slice(-100),
  };
  return writeBryantlabsJson(projectRoot, CHAT_FILE, payload, "filesystem");
}
