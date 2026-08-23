import { useEffect, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { GoToLineModal } from "@/components/GoToLineModal";
import { GoToSymbolModal } from "@/components/GoToSymbolModal";
import { GoToFileModal } from "@/components/GoToFileModal";

/** Global IDE shortcuts (editor-first navigation). */
export function WorkspaceKeybindings() {
  const { setRailTool } = useWorkspace();
  const [goToLineOpen, setGoToLineOpen] = useState(false);
  const [goToSymbolOpen, setGoToSymbolOpen] = useState(false);
  const [goToFileOpen, setGoToFileOpen] = useState(false);

  useEffect(() => {
    const onOpenGoToFile = () => setGoToFileOpen(true);
    const onOpenGoToLine = () => setGoToLineOpen(true);
    const onOpenGoToSymbol = () => setGoToSymbolOpen(true);
    window.addEventListener("bryantlabs:open-go-to-file", onOpenGoToFile);
    window.addEventListener("bryantlabs:open-go-to-line", onOpenGoToLine);
    window.addEventListener("bryantlabs:open-go-to-symbol", onOpenGoToSymbol);
    return () => {
      window.removeEventListener("bryantlabs:open-go-to-file", onOpenGoToFile);
      window.removeEventListener("bryantlabs:open-go-to-line", onOpenGoToLine);
      window.removeEventListener("bryantlabs:open-go-to-symbol", onOpenGoToSymbol);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setRailTool("search");
        window.dispatchEvent(new CustomEvent("bryantlabs:focus-content-search"));
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setRailTool("git");
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setGoToSymbolOpen(true);
        return;
      }

      if (!e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setGoToFileOpen(true);
        return;
      }

      if (!e.shiftKey && e.key === "\\") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("bryantlabs:toggle-editor-split"));
        return;
      }

      if (!e.shiftKey && e.key.toLowerCase() === "g") {
        const target = e.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setGoToLineOpen(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setRailTool]);

  return (
    <>
      <GoToLineModal open={goToLineOpen} onClose={() => setGoToLineOpen(false)} />
      <GoToSymbolModal open={goToSymbolOpen} onClose={() => setGoToSymbolOpen(false)} />
      <GoToFileModal open={goToFileOpen} onClose={() => setGoToFileOpen(false)} />
    </>
  );
}
