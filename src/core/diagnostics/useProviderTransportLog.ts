import { useEffect, useState } from "react";
import type { BryantLabsApi } from "@/types";
import {
  clearProviderTransportEvents,
  getProviderTransportEvents,
  subscribeProviderTransportEvents,
  type ProviderTransportEvent,
} from "@/core/diagnostics/providerTransport";
export {
  bindProviderTransportBridge,
  isProviderTransportBridgeBound,
  unbindProviderTransportBridge,
} from "@/core/diagnostics/providerTransportBridge";

export function useProviderTransportLog(
  api: BryantLabsApi | undefined,
): {
  readonly events: readonly ProviderTransportEvent[];
  readonly clear: () => void;
} {
  const [events, setEvents] = useState<readonly ProviderTransportEvent[]>(
    getProviderTransportEvents,
  );

  useEffect(() => subscribeProviderTransportEvents(setEvents), []);

  return {
    events,
    clear: () => {
      clearProviderTransportEvents();
      void api?.clearProviderTransportDiagnostics?.();
    },
  };
}
