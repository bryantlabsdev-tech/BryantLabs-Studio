export interface FollowUpChatMessage {
  readonly id: string;
  readonly role: "user" | "studio";
  readonly text: string;
  readonly at: number;
  readonly runId?: string;
  readonly outcome?: "success" | "failure" | "neutral";
  readonly filesModified?: readonly string[];
  readonly provider?: string;
  readonly model?: string;
  readonly durationMs?: number;
  readonly suggestedNextSteps?: readonly string[];
}

const STORAGE_PREFIX = "bryantlabs.followUpChat.";
const MAX_MESSAGES = 100;

function storageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${projectPath}`;
}

export function loadFollowUpChat(projectPath: string): FollowUpChatMessage[] {
  if (!projectPath) return [];
  try {
    const raw = localStorage.getItem(storageKey(projectPath));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FollowUpChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFollowUpChat(
  projectPath: string,
  messages: readonly FollowUpChatMessage[],
): void {
  if (!projectPath) return;
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(storageKey(projectPath), JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
}

export function appendFollowUpChatMessage(
  projectPath: string,
  message: FollowUpChatMessage,
): FollowUpChatMessage[] {
  const next = [...loadFollowUpChat(projectPath), message].slice(-MAX_MESSAGES);
  saveFollowUpChat(projectPath, next);
  return next;
}

export function createFollowUpChatMessage(
  role: FollowUpChatMessage["role"],
  text: string,
  extra?: Omit<FollowUpChatMessage, "id" | "role" | "text" | "at">,
): FollowUpChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    at: Date.now(),
    ...extra,
  };
}
