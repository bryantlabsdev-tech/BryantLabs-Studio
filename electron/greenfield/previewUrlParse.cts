import { DEFAULT_PREVIEW_PORT } from "./previewDiagnostics.cjs";

const DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PREVIEW_PORT}/`;

/** Align with Vite `--host 127.0.0.1` so iframe and probe hit the bound listener. */
export function normalizePreviewUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "localhost") u.hostname = "127.0.0.1";
    if (!u.hostname || u.hostname === "0.0.0.0" || u.hostname === "::1") {
      u.hostname = "127.0.0.1";
    }
    if (!u.pathname || u.pathname === "") u.pathname = "/";
    return u.toString();
  } catch {
    return DEFAULT_URL;
  }
}

/**
 * Strip ANSI / terminal control sequences. Preserves URLs from OSC 8 hyperlinks
 * (otherwise the URL is deleted with the escape sequence).
 */
export function stripAnsi(text: string): string {
  let out = text.replace(
    /\x1b\]8;;([^\u0007\x1b]+)(?:\x07|\x1b\\)/g,
    "$1",
  );
  out = out
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/[\u001b\u009b][\][()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]/g, "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
  return out;
}

/** Vite preview / dev server local URL (127.0.0.1 or localhost). */
const PREVIEW_URL_RE =
  /https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/[^\s<>"'`]*)?/gi;

const LOCAL_LINE_RE =
  /Local:\s*(https?:\/\/[^\s\u001b]+|(?:127\.0\.0\.1|localhost):\d+[^\s]*)/i;

const BARE_HOST_PORT_RE = /(?:127\.0\.0\.1|localhost):(\d{2,5})/gi;

function tryNormalizeCandidate(raw: string): string | null {
  let trimmed = raw.trim().replace(/[)\]},;]+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed.replace(/^\/+/, "")}`;
  }
  try {
    const u = new URL(trimmed);
    const host = u.hostname === "localhost" ? "127.0.0.1" : u.hostname;
    if (host !== "127.0.0.1") return null;
    if (!u.port) return null;
    return normalizePreviewUrl(u.toString());
  } catch {
    return null;
  }
}

/**
 * Parse preview URL from process output. Strips ANSI first so codes inside URLs
 * do not break matching (e.g. colored http://127.0.0.1:4173/).
 */
export function extractPreviewUrl(text: string): string | null {
  const cleaned = stripAnsi(text);

  const matches = cleaned.match(PREVIEW_URL_RE);
  if (matches?.length) {
    for (const raw of matches) {
      const url = tryNormalizeCandidate(raw);
      if (url) return url;
    }
  }

  const localLine = cleaned.match(LOCAL_LINE_RE);
  if (localLine?.[1]) {
    const url = tryNormalizeCandidate(localLine[1]);
    if (url) return url;
  }

  for (const m of cleaned.matchAll(BARE_HOST_PORT_RE)) {
    const port = m[1];
    if (!port) continue;
    const url = tryNormalizeCandidate(`http://127.0.0.1:${port}/`);
    if (url) return url;
  }

  return null;
}

/** Build the expected preview URL for a port we passed on the CLI. */
export function previewUrlForPort(port: number): string {
  return `http://127.0.0.1:${port}/`;
}
