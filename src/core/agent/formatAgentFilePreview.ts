import { AGENT_FILE_PREVIEW_CHARS } from "@/core/agent/agentContextLimits";

/**
 * Format file text for agent tool results — full content when small, head+tail when large.
 */
export function formatAgentFilePreview(
  content: string,
  maxChars: number = AGENT_FILE_PREVIEW_CHARS,
): string {
  if (content.length <= maxChars) return content;
  const marker = "\n\n… [truncated for agent context] …\n\n";
  const budget = Math.max(400, maxChars - marker.length);
  const head = Math.floor(budget * 0.65);
  const tail = budget - head;
  return `${content.slice(0, head)}${marker}${content.slice(-tail)}`;
}
