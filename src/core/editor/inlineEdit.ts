/** Cursor-style inline edit: user selects code and instructs a localized change. */

export interface InlineEditSelection {
  readonly relPath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
}

export function formatInlineEditPrompt(
  userPrompt: string,
  selection: InlineEditSelection,
): string {
  const instruction = userPrompt.trim();
  return [
    instruction,
    "",
    `Focus on the selected region in ${selection.relPath} (lines ${selection.startLine}–${selection.endLine}).`,
    "Preserve all code outside the selection unless required for correctness.",
    "",
    "--- SELECTED CODE BEGIN ---",
    selection.text,
    "--- SELECTED CODE END ---",
  ].join("\n");
}

export function selectionFromMonaco(
  relPath: string,
  startLine: number,
  endLine: number,
  text: string,
): InlineEditSelection | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return {
    relPath,
    startLine,
    endLine,
    text: trimmed,
  };
}
