export type FreshApplyDecision =
  | { readonly kind: "already-applied" }
  | { readonly kind: "write"; readonly basis: string };

/**
 * Decide how to apply a ready patch against the current on-disk file.
 * Matching live content is skipped; any other live content is used as the
 * applyEdit basis so one already-written file cannot block the rest.
 */
export function decideFreshApplyWrite(input: {
  readonly basisContent: string;
  readonly applyContent: string;
  readonly freshContent: string | undefined;
}): FreshApplyDecision {
  const { basisContent, applyContent, freshContent } = input;
  if (freshContent === undefined) {
    return { kind: "write", basis: basisContent };
  }
  if (freshContent === applyContent) {
    return { kind: "already-applied" };
  }
  if (freshContent === basisContent) {
    return { kind: "write", basis: basisContent };
  }
  return { kind: "write", basis: freshContent };
}
