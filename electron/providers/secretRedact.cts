/**
 * Canonical redaction for provider API keys (main process).
 * Keep in sync with src/core/providers/secretRedact.ts.
 */

export function redactProviderSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-••••")
    .replace(/sk-or-[A-Za-z0-9_-]+/g, "sk-or-••••")
    .replace(/\bgsk_[A-Za-z0-9_-]+/g, "gsk_••••")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza••••")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-••••")
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer ••••")
    .replace(/["']x-api-key["']\s*:\s*["'][^"']+["']/gi, '"x-api-key":"••••"')
    .replace(/x-api-key\s*[:=]\s*["']?[^"'\s]+/gi, "x-api-key: ••••")
    .replace(/([?&]key=)[^&\s]+/gi, "$1••••")
    .replace(/(?:^|[^\w])(key=)[^&\s]+/gi, (match) =>
      match.replace(/key=[^&\s]+/i, "key=••••"),
    );
}
