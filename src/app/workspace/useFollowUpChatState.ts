import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadPendingAgentChat,
  mergePendingIntoProjectChat,
} from "@/core/agent/agentChat";
import {
  mergeFollowUpChat,
  saveFollowUpChat,
  type FollowUpChatMessage,
} from "@/core/build/followUpChat";
import type { BryantLabsApi } from "@/types";

export function useFollowUpChatState(
  projectPath: string | undefined,
  api?: BryantLabsApi,
) {
  const [followUpChat, setFollowUpChat] = useState<FollowUpChatMessage[]>([]);
  const [pendingAgentChat, setPendingAgentChat] = useState<FollowUpChatMessage[]>(() =>
    loadPendingAgentChat(),
  );
  const hydratedRef = useRef(false);
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!projectPath) {
      hydratedRef.current = false;
      return;
    }
    let cancelled = false;
    hydratedRef.current = false;
    const local = mergePendingIntoProjectChat(projectPath);
    setFollowUpChat(local);
    setPendingAgentChat([]);
    const readApi = apiRef.current;

    const finish = (messages: FollowUpChatMessage[]) => {
      if (cancelled) return;
      saveFollowUpChat(projectPath, messages);
      setFollowUpChat(messages);
      hydratedRef.current = true;
    };

    if (!readApi?.readFollowUpChat) {
      finish(local);
      return;
    }

    void readApi
      .readFollowUpChat()
      .then((record) => {
        const disk = record?.messages ?? [];
        finish(mergeFollowUpChat(disk, local));
      })
      .catch(() => {
        finish(local);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath || !hydratedRef.current) return;
    saveFollowUpChat(projectPath, followUpChat);
    if (api?.writeFollowUpChat && followUpChat.length > 0) {
      void api.writeFollowUpChat(followUpChat);
    }
  }, [api, followUpChat, projectPath]);

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
