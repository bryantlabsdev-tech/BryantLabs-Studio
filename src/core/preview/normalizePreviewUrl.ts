/** Match main-process preview host binding (127.0.0.1). */
export function normalizePreviewUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "localhost") u.hostname = "127.0.0.1";
    if (!u.pathname || u.pathname === "") u.pathname = "/";
    return u.toString();
  } catch {
    return raw;
  }
}
