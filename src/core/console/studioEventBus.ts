import type { StudioEvent, StudioEventListener } from "@/core/console/types";

/**
 * Central pub/sub for Studio execution observability.
 * Subsystems emit structured events; ExecutionLogService and UI subscribe.
 */
class StudioEventBusImpl {
  private listeners = new Set<StudioEventListener>();

  subscribe(listener: StudioEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: StudioEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Observability must never break execution.
      }
    }
  }
}

export const studioEventBus = new StudioEventBusImpl();
