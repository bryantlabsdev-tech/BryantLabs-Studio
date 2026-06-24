import { outcomeLabel, type RunOutcome } from "@/core/agent/runOutcome";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";

export function runHistoryOutcomeLabel(outcome: RunTerminalOutcome): string {
  return outcomeLabel(outcome as RunOutcome);
}

export { RUN_OUTCOMES } from "@/core/agent/runOutcome";
