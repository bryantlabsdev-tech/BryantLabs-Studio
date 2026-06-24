import hljs from "highlight.js/lib/common";

/**
 * Syntax highlighting helper. Returns HTML with `hljs` token spans.
 *
 * `highlight.js` escapes the source text before inserting tokens, so the
 * resulting markup is safe to assign via `innerHTML`. We only ever pass it
 * local file content that the user explicitly opened (read-only).
 */
export function highlightCode(code: string, language: string | null): string {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language }).value;
  }
  return hljs.highlightAuto(code).value;
}
