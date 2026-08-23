import { useEffect } from "react";
import type { BryantLabsApi } from "@/types";
import {
  bindProviderTransportBridge,
  unbindProviderTransportBridge,
} from "@/core/diagnostics/providerTransportBridge";

/** Bind main-process transport events once for the app shell lifetime. */
export function useProviderTransportBridge(api: BryantLabsApi | undefined): void {
  useEffect(() => {
    bindProviderTransportBridge(api);
    return () => {
      unbindProviderTransportBridge();
    };
  }, [api]);
}
