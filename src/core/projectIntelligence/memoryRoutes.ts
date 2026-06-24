export const PROJECT_MEMORY_CONTEXT_MAX_CHARS = 1_500;

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(sk-[a-zA-Z0-9_-]{10,})\b/g,
  /\b(api[_-]?key\s*[:=]\s*["']?[\w-]{8,}["']?)/gi,
  /\b(secret\s*[:=]\s*["']?[\w-]{8,}["']?)/gi,
  /\b(password\s*[:=]\s*["']?[^\s"']{4,}["']?)/gi,
  /\bBearer\s+[a-zA-Z0-9._-]{10,}\b/g,
  /\bghp_[a-zA-Z0-9]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
];

export function stripSecretsFromMemoryText(text: string): string {
  let cleaned = text;
  for (const pattern of SECRET_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[redacted]");
  }
  return cleaned;
}

export function truncateMemoryContext(text: string, maxChars = PROJECT_MEMORY_CONTEXT_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 3).trimEnd()}...`;
}

export function shouldInjectProjectMemory(
  route: string | null | undefined,
  prompt?: string | null,
): boolean {
  const normalizedRoute = route?.trim() ?? "";
  if (
    normalizedRoute === "edit_follow_up" ||
    normalizedRoute === "apply_plan" ||
    normalizedRoute === "pipeline"
  ) {
    return true;
  }
  const trimmedPrompt = prompt?.trim() ?? "";
  if (!trimmedPrompt) return false;
  if (/fix the ui audit advisory/i.test(trimmedPrompt)) return true;
  if (/apply the previously successful fix/i.test(trimmedPrompt)) return true;
  return /\b(fix|follow-up|follow up|repair|overflow|responsive)\b/i.test(trimmedPrompt);
}
