import { getProviderInfo } from "@/core/providers/registry";
import {
  failureHeadline,
  type ProviderFallbackRequest,
} from "@/core/providers/costControls";
import type { ProviderFallbackChoice } from "@/core/providers/reliability";
import { reliabilityStatusLabel } from "@/core/providers/reliability";

export function ProviderFallbackDialog({
  request,
  onChoose,
  onCancel,
}: {
  request: ProviderFallbackRequest;
  onChoose: (choice: ProviderFallbackChoice) => void;
  onCancel: () => void;
}) {
  return (
    <div className="provider-fallback" role="dialog" aria-modal="true">
      <div className="provider-fallback__card">
        <h3 className="provider-fallback__title">Provider failed</h3>
        <p className="provider-fallback__lead">
          <strong>{getProviderInfo(request.failedProvider).label}</strong>
          {request.failedModel ? ` · ${request.failedModel}` : ""}
        </p>
        <p className="provider-fallback__error">
          <strong>Reason:</strong> {reliabilityStatusLabel(request.failure.status)}
        </p>
        <p className="provider-fallback__error">{failureHeadline(request.failure)}</p>
        <p className="plan__muted">Choose fallback:</p>
        <div className="provider-fallback__actions">
          {request.options.map((option) => (
            <button
              key={option.provider}
              type="button"
              className="prov-btn prov-btn--primary"
              onClick={() => onChoose(option.provider)}
            >
              {option.label} · {option.model}
            </button>
          ))}
          {request.allowRetry ? (
            <button
              type="button"
              className="prov-btn"
              onClick={() => onChoose("retry")}
            >
              Retry same provider
            </button>
          ) : null}
          <button type="button" className="prov-btn" onClick={onCancel}>
            Cancel run
          </button>
        </div>
      </div>
    </div>
  );
}
