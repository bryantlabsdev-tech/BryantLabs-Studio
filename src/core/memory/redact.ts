import { redactProviderSecrets } from "@/core/providers/reliability";

const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /x-api-key:\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*["']?[^"'\s]+/gi,
  /password\s*[:=]\s*["']?[^"'\s]+/gi,
  /secret\s*[:=]\s*["']?[^"'\s]+/gi,
  /token\s*[:=]\s*["']?[^"'\s]+/gi,
  /process\.env\.[A-Z0-9_]+/g,
];

/** Redact secrets before persisting or exporting memories. */
export function redactMemoryText(text: string): string {
  let out = redactProviderSecrets(text);
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

export function memoryTextIsSafe(text: string): boolean {
  const redacted = redactMemoryText(text);
  return redacted === text;
}
