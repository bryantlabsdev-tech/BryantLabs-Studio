import { useEffect, useMemo, useState } from "react";
import {
  loadPendingAgentChat,
  mergePendingIntoProjectChat,
} from "@/core/agent/agentChat";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";

export function useFollowUpChatState(projectPath: string | undefined) {
  const [followUpChat, setFollowUpChat] = useState<FollowUpChatMessage[]>([]);
  const [pendingAgentChat, setPendingAgentChat] = useState<FollowUpChatMessage[]>(() =>
    loadPendingAgentChat(),
  );

  useEffect(() => {
    if (!projectPath) return;
    setFollowUpChat(mergePendingIntoProjectChat(projectPath));
    setPendingAgentChat([]);
  }, [projectPath]);

  const agentChat = useMemo(
    () => (projectPath ? followUpChat : pendingAgentChat),
    [projectPath, followUpChat, pendingAgentChat],
  );

  return {
    followUpChat,
    setFollowUpChat,
    pendingAgentChat,
    setPendingAgentChat,
    agentChat,
  };
}
