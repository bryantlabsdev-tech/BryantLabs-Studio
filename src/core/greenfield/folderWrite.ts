export const FOLDER_NOT_EMPTY_CODE = "FOLDER_NOT_EMPTY" as const;

export function isFolderNotEmptyWriteError(
  res: { error?: string; code?: string } | null | undefined,
): boolean {
  if (!res) return false;
  if (res.code === FOLDER_NOT_EMPTY_CODE) return true;
  return typeof res.error === "string" && /not empty/i.test(res.error);
}

export function folderNotEmptyUserMessage(): string {
  return "The selected folder is not empty. Choose another folder, create a new numbered folder, or clear this folder after confirming.";
}
