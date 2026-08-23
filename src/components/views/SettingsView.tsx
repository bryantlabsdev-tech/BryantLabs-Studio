import { ProvidersView } from "@/components/views/ProvidersView";
import { SETTINGS_VIEW_TEST_ID } from "@/core/layout/settingsNavigation";

/**
 * Settings shell — hosts provider configuration, enablement toggles, and routing.
 */
export function SettingsView() {
  return (
    <div className="settings-view" data-testid={SETTINGS_VIEW_TEST_ID}>
      <ProvidersView />
    </div>
  );
}
