import type { BryantLabsApi } from "@/types";
import {
  replaceProviderTransportEvents,
  upsertProviderTransportEvent,
  type ProviderTransportEvent,
} from "@/core/diagnostics/providerTransport";

let bridgeBound = false;
let bridgeUnsub: (() => void) | null = null;

/** Bind main-process transport events into the renderer ring (idempotent). */
export function bindProviderTransportBridge(api: BryantLabsApi | undefined): void {
  if (!api?.onProviderTransportEvent || bridgeBound) return;
  bridgeBound = true;

  void api.getProviderTransportDiagnostics?.().then((events) => {
    if (Array.isArray(events) && events.length > 0) {
      replaceProviderTransportEvents(events as ProviderTransportEvent[]);
    }
  });

  bridgeUnsub = api.onProviderTransportEvent((event) => {
    upsertProviderTransportEvent(event as ProviderTransportEvent);
  });
}

/** Test-only teardown. */
export function unbindProviderTransportBridge(): void {
  bridgeUnsub?.();
  bridgeUnsub = null;
  bridgeBound = false;
}

/** Test helper — whether the IPC bridge is currently bound. */
export function isProviderTransportBridgeBound(): boolean {
  return bridgeBound;
}
