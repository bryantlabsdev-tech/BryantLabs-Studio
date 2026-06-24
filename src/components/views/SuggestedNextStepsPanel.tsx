interface SuggestedNextStepsPanelProps {
  steps: readonly string[];
  onSelect: (step: string) => void;
}

export function SuggestedNextStepsPanel({
  steps,
  onSelect,
}: SuggestedNextStepsPanelProps) {
  if (steps.length === 0) return null;

  return (
    <div className="suggested-next">
      <span className="suggested-next__title">Try next</span>
      <ul className="suggested-next__list">
        {steps.map((step) => (
          <li key={step}>
            <button
              type="button"
              className="suggested-next__chip"
              onClick={() => onSelect(step)}
            >
              {step}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
