import { useEffect, useState } from "react";
import {
  CUSTOM_MODEL_VALUE,
  curatedModelSelectValue,
  curatedModelsForProvider,
  formatCuratedModelOptionLabel,
  isCuratedModel,
} from "@/core/providers/providerModels";
import type { ProviderId } from "@/core/providers/types";

interface CuratedProviderModelSelectProps {
  provider: ProviderId;
  model: string;
  onModelChange: (model: string) => void;
  /** When set, models not in this list are disabled in the dropdown. */
  availableModelIds?: readonly string[] | undefined;
  id?: string;
  inputClassName?: string;
}

export function CuratedProviderModelSelect({
  provider,
  model,
  onModelChange,
  availableModelIds,
  id = "prov-model",
  inputClassName = "prov-input",
}: CuratedProviderModelSelectProps) {
  const entries = curatedModelsForProvider(provider);
  const selectValue = curatedModelSelectValue(model, provider);
  const showCustomInput = selectValue === CUSTOM_MODEL_VALUE;
  const [customDraft, setCustomDraft] = useState(
    showCustomInput ? model.trim() : "",
  );

  useEffect(() => {
    setCustomDraft(showCustomInput ? model.trim() : "");
  }, [provider, model, showCustomInput]);

  const handleSelectChange = (value: string) => {
    if (value === CUSTOM_MODEL_VALUE) {
      onModelChange(customDraft.trim());
      return;
    }
    onModelChange(value);
  };

  const handleCustomChange = (value: string) => {
    setCustomDraft(value);
    onModelChange(value);
  };

  return (
    <>
      <select
        id={id}
        className={inputClassName}
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
      >
        {entries.map((entry) => {
          const unavailable =
            availableModelIds != null && !availableModelIds.includes(entry.id);
          return (
            <option key={entry.id} value={entry.id} disabled={unavailable}>
              {formatCuratedModelOptionLabel(entry, { unavailable })}
            </option>
          );
        })}
        <option value={CUSTOM_MODEL_VALUE}>Custom Model</option>
      </select>
      {showCustomInput ? (
        <input
          className={inputClassName}
          value={customDraft}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Enter model id"
          spellCheck={false}
          aria-label={`Custom ${provider} model`}
        />
      ) : null}
    </>
  );
}

export function isCuratedProviderModel(provider: ProviderId, model: string): boolean {
  return isCuratedModel(model, provider);
}
