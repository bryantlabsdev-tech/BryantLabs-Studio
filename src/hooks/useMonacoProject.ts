import { useEffect, useRef } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import {
  resetMonacoTypeScriptProject,
  syncMonacoChangedFiles,
  syncMonacoTypeScriptProject,
} from "@/monaco/typescriptProject";

/** Keep Monaco TS/JS models in sync with the open project scan. */
export function useMonacoProjectSync(): void {
  const { project, scan, scanStatus } = useWorkspace();
  const api = window.bryantlabs;
  const initialSyncProjectRef = useRef<string | null>(null);
  const scanRef = useRef(scan);
  scanRef.current = scan;

  useEffect(() => {
    if (!api || !project || !scan || scanStatus !== "done") {
      if (!project) {
        initialSyncProjectRef.current = null;
        resetMonacoTypeScriptProject();
      }
      return;
    }

    if (initialSyncProjectRef.current === project.path) {
      return;
    }

    initialSyncProjectRef.current = project.path;
    let cancelled = false;

    void syncMonacoTypeScriptProject(project, scan, async (absPath) => {
      if (cancelled) return { readable: false };
      try {
        const res = await api.readFile(absPath);
        return {
          readable: res.readable,
          ...(res.content !== undefined ? { content: res.content } : {}),
        };
      } catch {
        return { readable: false };
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api, project, scan, scanStatus]);

  useEffect(() => {
    if (!api?.onProjectIndexUpdated || !project) return;

    const readFile = async (absPath: string) => {
      try {
        const res = await api.readFile(absPath);
        return {
          readable: res.readable,
          ...(res.content !== undefined ? { content: res.content } : {}),
        };
      } catch {
        return { readable: false };
      }
    };

    return api.onProjectIndexUpdated((event) => {
      if (initialSyncProjectRef.current !== project.path) return;
      void syncMonacoChangedFiles(
        project,
        event.changedPaths,
        event.deletedPaths,
        readFile,
      );
    });
  }, [api, project]);
}
