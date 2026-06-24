import type { StudioWorkflowDetails } from "@/core/studioRun/types";

export type RoutingIntentSnapshot = NonNullable<
  StudioWorkflowDetails["routingIntent"]
>;

let lastRoutingIntent: RoutingIntentSnapshot | null = null;

export function setLastRoutingIntent(
  intent: RoutingIntentSnapshot | null | undefined,
): void {
  if (intent) {
    lastRoutingIntent = intent;
  }
}

export function getLastRoutingIntent(): RoutingIntentSnapshot | null {
  return lastRoutingIntent;
}

export function clearLastRoutingIntent(): void {
  lastRoutingIntent = null;
}
