import { useWorkspace } from "@/app/WorkspaceProvider";

/**
 * Compact top-bar indicator for the active AI provider and health.
 * Click opens the Providers panel.
 */
export function ProviderStatusPill() {
  const { isDesktop, providerStatus, openProvidersView } = useWorkspace();

  if (!isDesktop || !providerStatus) return null;

  const { tone, pillText, tooltip, checking } = providerStatus;

  return (
    <button
      type="button"
      className={`titlebar__provider-pill titlebar__provider-pill--${tone}${
        checking ? " titlebar__provider-pill--checking" : ""
      }`}
      title={tooltip}
      aria-label={tooltip.replace(/\n/g, ". ")}
      onClick={openProvidersView}
    >
      <span className="titlebar__provider-dot" aria-hidden />
      <span className="titlebar__provider-text">{pillText}</span>
    </button>
  );
}
