export interface UiRepairPatch {
  readonly relPath: string;
  readonly content: string;
}

export interface UiRepairOutcome {
  readonly strategy: string;
  readonly patches: readonly UiRepairPatch[];
}
