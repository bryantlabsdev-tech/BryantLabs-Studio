import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { ProjectFact } from "@/core/domain/capabilities";
import {
  suggestNextImprovements as suggestFromDomain,
  suggestNextSteps,
} from "@/core/domain/suggestions";

export { suggestNextSteps };

export function suggestNextImprovements(
  memory: SessionMemorySnapshot,
  chat: readonly FollowUpChatMessage[],
  facts: readonly ProjectFact[],
): string[] {
  return suggestFromDomain(memory, chat, facts);
}
