export type {
  EditKind,
  EditParams,
  Patch,
  PatchError,
  DiffRow,
  DiffRowType,
  ValidationResult,
} from "@/core/editor/types";
export { createPatch, isPatchError } from "@/core/editor/edits";
export { validatePatch, isEditablePath, MAX_EDIT_BYTES } from "@/core/editor/validate";
export { computeDiff } from "@/core/editor/diff";
