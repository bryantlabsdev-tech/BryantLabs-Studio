/** Masked API key for display (never includes full secret). */
export function formatMaskedApiKeyPreview(rawKey: string): string | null {
  const key = rawKey.trim();
  if (key.length === 0) return null;

  const last4 = key.length >= 4 ? key.slice(-4) : key;
  let prefix: string;
  if (key.startsWith("sk-ant-")) prefix = "sk-ant";
  else if (key.startsWith("sk-or-")) prefix = "sk-or";
  else if (key.startsWith("sk-")) prefix = "sk-";
  else if (key.startsWith("gsk_")) prefix = "gsk_";
  else if (key.startsWith("AIza")) prefix = "AIza";
  else prefix = key.slice(0, Math.min(4, Math.max(2, key.length - last4.length)));

  const middleLen = Math.max(8, key.length - prefix.length - last4.length);
  return `${prefix}${"*".repeat(middleLen)}${last4}`;
}

export function isMaskedApiKeyPreview(value: string): boolean {
  const trimmed = value.trim();
  return /\*{4,}/.test(trimmed);
}
