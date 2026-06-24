import type { MentionSuggestion } from "@/core/agent/composerMentionSuggestions";

export interface MentionAutocompleteProps {
  readonly suggestions: readonly MentionSuggestion[];
  readonly activeIndex: number;
  readonly onSelect: (suggestion: MentionSuggestion) => void;
}

export function MentionAutocomplete({
  suggestions,
  activeIndex,
  onSelect,
}: MentionAutocompleteProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      className="mention-autocomplete"
      role="listbox"
      aria-label="Mention suggestions"
      data-testid="mention-autocomplete"
    >
      <p className="mention-autocomplete__title">Pin context with @</p>
      <ul className="mention-autocomplete__list">
        {suggestions.map((suggestion, index) => (
          <li key={`${suggestion.kind}:${suggestion.insertText}`}>
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={[
                "mention-autocomplete__item",
                index === activeIndex ? "mention-autocomplete__item--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(suggestion);
              }}
            >
              <span
                className={`mention-autocomplete__badge mention-autocomplete__badge--${suggestion.kind}`}
              >
                {suggestion.kind === "codebase"
                  ? "◎"
                  : suggestion.kind === "symbol"
                    ? "◇"
                    : "📄"}
              </span>
              <span className="mention-autocomplete__label">@{suggestion.label}</span>
              <span className="mention-autocomplete__detail">{suggestion.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
