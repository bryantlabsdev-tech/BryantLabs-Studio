/** Normalize prompt text before JSON request bodies (API transport safety). */
export function sanitizeProviderPrompt(prompt: string): string {
  if (!prompt) return "";
  let out = "";
  for (let i = 0; i < prompt.length; i += 1) {
    const code = prompt.charCodeAt(i);
    // Strip C0 controls except tab/newline/carriage return.
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = prompt.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += prompt[i]! + prompt[i + 1]!;
        i += 1;
      } else {
        out += "\uFFFD";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }
    out += prompt[i]!;
  }
  return out;
}

/** Serialize provider JSON bodies as UTF-8 strings (fetch-safe in Electron). */
export function jsonRequestBody(value: unknown): string {
  const serialized = JSON.stringify(value);
  // Fail fast before sending malformed payloads to cloud APIs.
  JSON.parse(serialized);
  return serialized;
}
