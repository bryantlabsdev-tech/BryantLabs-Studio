/** Remove @@FILE/@@END marker leakage from parsed model output (truncated responses). */

const MARKER_LINE_RE = /^\s*@@(?:FILE|END)(?::[^\n@]*)?(?:@@)?\s*$/;
const TRAILING_MARKER_RE = /(?:\r?\n|\r)?\s*@@(?:END|FILE)(?::[^\n@]*)?(?:@@)?\s*$/;

export function stripMarkerArtifactsFromContent(content: string): string {
  let next = content.replace(TRAILING_MARKER_RE, "");
  const lines = next.split("\n");
  while (lines.length > 0 && MARKER_LINE_RE.test(lines[lines.length - 1]!.trim())) {
    lines.pop();
  }
  return lines.join("\n").trimEnd();
}

export function contentHasMarkerArtifacts(content: string): boolean {
  if (TRAILING_MARKER_RE.test(content)) return true;
  const lastLine = content.trim().split("\n").pop()?.trim() ?? "";
  return MARKER_LINE_RE.test(lastLine);
}
