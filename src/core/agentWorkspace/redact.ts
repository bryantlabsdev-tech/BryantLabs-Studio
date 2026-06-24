/** Strip likely secrets from copied/exported agent diagnostics. */
const SECRET_VALUE_RE =
  /("?(?:api[_-]?key|secret|token|password|authorization|bearer)"?\s*[:=]\s*)(["']?)([^"'\s]{8,})\2/gi;

const INLINE_SECRET_RE =
  /\b(sk-ant-[a-zA-Z0-9-]{8,}|sk-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/g;

export function redactSecrets(text: string): string {
  let out = text.replace(
    SECRET_VALUE_RE,
    (_m, prefix: string, _q: string, _val: string) => `${prefix}[REDACTED]`,
  );
  out = out.replace(INLINE_SECRET_RE, "[REDACTED]");
  return out;
}

export function redactSecretsDeep<T>(value: T): T {
  if (typeof value === "string") return redactSecrets(value) as T;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecretsDeep(v)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactSecretsDeep(v);
    }
    return out as T;
  }
  return value;
}
