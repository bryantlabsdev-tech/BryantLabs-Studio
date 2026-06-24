import {
  createFollowUpChatMessage,
  loadFollowUpChat,
  saveFollowUpChat,
  type FollowUpChatMessage,
} from "@/core/build/followUpChat";

const PENDING_KEY = "bryantlabs.agentChat.pending";

export function loadPendingAgentChat(): FollowUpChatMessage[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FollowUpChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePendingAgentChat(messages: readonly FollowUpChatMessage[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(messages.slice(-100)));
  } catch {
    /* ignore */
  }
}

export function appendPendingAgentMessage(message: FollowUpChatMessage): FollowUpChatMessage[] {
  const next = [...loadPendingAgentChat(), message].slice(-100);
  savePendingAgentChat(next);
  return next;
}

export function clearPendingAgentChat(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function mergePendingIntoProjectChat(projectPath: string): FollowUpChatMessage[] {
  const pending = loadPendingAgentChat();
  if (pending.length === 0) return loadFollowUpChat(projectPath);
  const existing = loadFollowUpChat(projectPath);
  const merged = [...existing, ...pending].slice(-100);
  saveFollowUpChat(projectPath, merged);
  clearPendingAgentChat();
  return merged;
}

export function createAgentUserMessage(text: string): FollowUpChatMessage {
  return createFollowUpChatMessage("user", text);
}

export function createAgentStudioMessage(
  text: string,
  extra?: Omit<FollowUpChatMessage, "id" | "role" | "text" | "at">,
): FollowUpChatMessage {
  return createFollowUpChatMessage("studio", text, extra);
}
