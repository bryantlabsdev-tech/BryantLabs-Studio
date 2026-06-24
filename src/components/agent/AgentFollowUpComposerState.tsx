export interface AgentFollowUpComposerStateProps {
  readonly headline: string | null;
  readonly suggestions: readonly string[];
  readonly onSuggestionClick?: (text: string) => void;
}

export function AgentFollowUpComposerState({
  headline,
  suggestions,
  onSuggestionClick,
}: AgentFollowUpComposerStateProps) {
  if (!headline) return null;

  return (
    <section className="agent-follow-up-state" data-testid="agent-follow-up-composer-state">
      <p className="agent-follow-up-state__headline">{headline}</p>
      {suggestions.length > 0 && onSuggestionClick ? (
        <ul className="agent-follow-up-state__suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="agent-follow-up-state__suggestion"
                onClick={() => onSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
