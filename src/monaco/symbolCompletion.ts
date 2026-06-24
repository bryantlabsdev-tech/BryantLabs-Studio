import type { Monaco } from "@monaco-editor/react";
import type { SymbolEntry, SymbolKind } from "@/types";
import type { editor, languages, Position } from "monaco-editor";

const COMPLETION_LANGUAGES = [
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
] as const;

let activeDisposer: { dispose: () => void } | null = null;

function monacoKindForSymbol(
  monaco: Monaco,
  kind: SymbolKind,
): Monaco["languages"]["CompletionItemKind"] {
  switch (kind) {
    case "component":
    case "class":
      return monaco.languages.CompletionItemKind.Class;
    case "interface":
    case "type":
      return monaco.languages.CompletionItemKind.Interface;
    case "hook":
    case "function":
      return monaco.languages.CompletionItemKind.Function;
    default:
      return monaco.languages.CompletionItemKind.Variable;
  }
}

/**
 * Registers cross-file symbol completions from the project scan (supplements TS language service).
 */
export function registerProjectSymbolCompletions(
  monaco: Monaco,
  symbols: readonly SymbolEntry[],
): () => void {
  activeDisposer?.dispose();

  const unique = new Map<string, SymbolEntry>();
  for (const symbol of symbols) {
    const existing = unique.get(symbol.name);
    if (!existing || symbol.path.startsWith("src/")) {
      unique.set(symbol.name, symbol);
    }
  }

  const provider = monaco.languages.registerCompletionItemProvider(
    [...COMPLETION_LANGUAGES],
    {
      triggerCharacters: [".", "@"],
      provideCompletionItems(
        model: editor.ITextModel,
        position: Position,
      ): languages.ProviderResult<languages.CompletionList> {
        const word = model.getWordUntilPosition(position);
        const linePrefix = model
          .getLineContent(position.lineNumber)
          .slice(0, position.column - 1);
        const atMatch = linePrefix.match(/@([A-Za-z0-9_]*)$/);
        const prefix = (atMatch?.[1] ?? word.word).toLowerCase();
        if (prefix.length < 1) return { suggestions: [] };

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: atMatch
            ? position.column - (atMatch[1]?.length ?? 0)
            : word.startColumn,
          endColumn: position.column,
        };

        const suggestions = [...unique.values()]
          .filter((symbol) => symbol.name.toLowerCase().startsWith(prefix))
          .slice(0, 24)
          .map((symbol) => ({
            label: symbol.name,
            kind: monacoKindForSymbol(monaco, symbol.kind),
            insertText: symbol.name,
            detail: `${symbol.kind} · ${symbol.path}`,
            documentation: symbol.line
              ? `Defined at ${symbol.path}:${symbol.line}`
              : `Defined in ${symbol.path}`,
            range,
            sortText: `0_${symbol.name}`,
          }));

        return { suggestions };
      },
    },
  );

  activeDisposer = provider;
  return () => {
    provider.dispose();
    if (activeDisposer === provider) activeDisposer = null;
  };
}

export function disposeProjectSymbolCompletions(): void {
  activeDisposer?.dispose();
  activeDisposer = null;
}
