import { useEffect } from "react";
import {
  ACTIVE_EDITOR_CONTEXT_EVENT,
  type ActiveEditorContext,
} from "@/core/context/activeEditorContext";

export function useActiveEditorContextRef(
  activeEditorContextRef: React.MutableRefObject<ActiveEditorContext | null>,
): void {
  useEffect(() => {
    const onContext = (event: Event) => {
      activeEditorContextRef.current =
        (event as CustomEvent<ActiveEditorContext | null>).detail ?? null;
    };
    window.addEventListener(ACTIVE_EDITOR_CONTEXT_EVENT, onContext);
    return () => window.removeEventListener(ACTIVE_EDITOR_CONTEXT_EVENT, onContext);
  }, [activeEditorContextRef]);
}
