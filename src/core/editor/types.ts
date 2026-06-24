/**
 * Editor types (Phase 5 — Safe File Editing).
 *
 * Phase 5 introduces the first WRITE-capable system. Edits are deterministic,
 * single-file, and require explicit user approval. There is no AI, no
 * generation, and no multi-file autonomy.
 */

export type EditKind = "prepend-comment" | "replace-text" | "append-note";

export interface EditParams {
  /** prepend-comment */
  comment?: string;
  /** replace-text */
  find?: string;
  replace?: string;
  /** append-note */
  note?: string;
}

export interface Patch {
  kind: EditKind;
  /** File content before the edit (the basis the patch was computed from). */
  before: string;
  /** File content after the edit. */
  after: string;
  /** Human-readable description of what the patch does. */
  description: string;
}

export interface PatchError {
  error: string;
}

export type DiffRowType = "context" | "add" | "remove";

export interface DiffRow {
  type: DiffRowType;
  text: string;
  leftNo: number | null;
  rightNo: number | null;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}
