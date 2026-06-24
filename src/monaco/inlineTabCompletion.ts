import type { Monaco } from "@monaco-editor/react";
import { suggestLineContinuation } from "@/core/editor/lineContinuation";
import type { SymbolEntry } from "@/types";
import type { CancellationToken, editor, languages, Position } from "monaco-editor";

const INLINE_LANGUAGES = [
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
] as const;

const AI_DEBOUNCE_MS = 450;
const AI_MIN_PREFIX_LEN = 4;

export interface AiInlineSuggestInput {
  readonly relPath: string;
  readonly languageId: string;
  readonly linePrefix: string;
  readonly lineSuffix: string;
}

export type AiInlineSuggestFn = (
  input: AiInlineSuggestInput,
  token: CancellationToken,
) => Promise<string | null>;

let activeDisposer: { dispose: () => void } | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceSeq = 0;

function clearDebounce(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function debouncedAiSuffix(
  fetchAiSuffix: AiInlineSuggestFn,
  input: AiInlineSuggestInput,
  token: CancellationToken,
): Promise<string | null> {
  if (token.isCancellationRequested) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    clearDebounce();
    const seq = ++debounceSeq;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (token.isCancellationRequested || seq !== debounceSeq) {
        resolve(null);
        return;
      }
      void fetchAiSuffix(input, token).then(resolve).catch(() => resolve(null));
    }, AI_DEBOUNCE_MS);
  });
}

/**
 * Ghost-text tab completions: local symbol index first, optional provider suffix.
 */
export function registerInlineTabCompletions(
  monaco: Monaco,
  symbols: readonly SymbolEntry[],
  fetchAiSuffix?: AiInlineSuggestFn,
  relPath?: string,
): () => void {
  activeDisposer?.dispose();
  clearDebounce();

  const provider = monaco.languages.registerInlineCompletionsProvider(
    [...INLINE_LANGUAGES],
    {
      groupId: "bryantlabs-tab",
      provideInlineCompletions(
        model: editor.ITextModel,
        position: Position,
        _context: languages.InlineCompletionContext,
        token: CancellationToken,
      ): languages.ProviderResult<languages.InlineCompletions> {
        const line = model.getLineContent(position.lineNumber);
        const prefix = line.slice(0, position.column - 1);
        const suffix = line.slice(position.column - 1);

        const local = suggestLineContinuation(prefix, symbols);
        if (local) {
          return {
            items: [
              {
                insertText: local,
                range: {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endColumn: position.column,
                },
                completeBracketPairs: true,
              },
            ],
          };
        }

        if (
          !fetchAiSuffix ||
          prefix.trim().length < AI_MIN_PREFIX_LEN ||
          token.isCancellationRequested
        ) {
          return { items: [] };
        }

        const languageId = model.getLanguageId();
        const fileRel = relPath ?? model.uri.path.replace(/^\//, "");

        return debouncedAiSuffix(
          fetchAiSuffix,
          {
            relPath: fileRel,
            languageId,
            linePrefix: prefix,
            lineSuffix: suffix,
          },
          token,
        ).then((aiSuffix) => {
          if (!aiSuffix || token.isCancellationRequested) {
            return { items: [] };
          }
          return {
            items: [
              {
                insertText: aiSuffix,
                range: {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endColumn: position.column,
                },
                completeBracketPairs: true,
              },
            ],
          };
        });
      },
      freeInlineCompletions: () => {},
    },
  );

  activeDisposer = provider;
  return () => {
    clearDebounce();
    provider.dispose();
    if (activeDisposer === provider) activeDisposer = null;
  };
}

export function disposeInlineTabCompletions(): void {
  clearDebounce();
  activeDisposer?.dispose();
  activeDisposer = null;
}
