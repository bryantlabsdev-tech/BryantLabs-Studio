import { useCallback, useEffect, useRef } from "react";
import { useWorkspace } from "@/app/workspaceContext";
import {
  resetMonacoTypeScriptProject,
  syncMonacoChangedFiles,
  syncMonacoProjectTypeLibs,
  syncMonacoTypeScriptProject,
} from "@/monaco/typescriptProject";

/** Keep Monaco TS/JS models in sync with the open project scan. */
export function useMonacoProjectSync(): void {
  const { project, scan, scanStatus } = useWorkspace();
  const api = window.bryantlabs;
  const initialSyncProjectRef = useRef<string | null>(null);
  const typeLibsReadyRef = useRef(false);

  const readFile = useCallback(
    async (absPath: string) => {
      if (!api) return { readable: false as const };
      try {
        const res = await api.readFile(absPath);
        return {
          readable: res.readable,
          ...(res.content !== undefined ? { content: res.content } : {}),
        };
      } catch {
        return { readable: false as const };
      }
    },
    [api],
  );

  useEffect(() => {
    if (!api || !project || !scan || scanStatus !== "done") {
      if (!project) {
        initialSyncProjectRef.current = null;
        typeLibsReadyRef.current = false;
        resetMonacoTypeScriptProject();
      }
      return;
    }

    if (initialSyncProjectRef.current === project.path) {
      return;
    }

    initialSyncProjectRef.current = project.path;
    typeLibsReadyRef.current = false;
    let cancelled = false;

    void syncMonacoTypeScriptProject(project, scan, readFile).then(async () => {
      if (cancelled) return;
      typeLibsReadyRef.current = await syncMonacoProjectTypeLibs(project, readFile);
    });

    return () => {
      cancelled = true;
    };
  }, [api, project, scan, scanStatus, readFile]);

  useEffect(() => {
    if (!api || !project || scanStatus !== "done") return;
    if (typeLibsReadyRef.current) return;
    let cancelled = false;
    let attempts = 0;
    const tick = () => {
      if (cancelled || typeLibsReadyRef.current || attempts >= 16) return;
      attempts += 1;
      void syncMonacoProjectTypeLibs(project, readFile).then((ok) => {
        if (!cancelled) typeLibsReadyRef.current = ok;
      });
    };
    const delay = window.setTimeout(tick, 800);
    const id = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(delay);
      window.clearInterval(id);
    };
  }, [api, project, scanStatus, scan?.files.length, readFile]);

  useEffect(() => {
    if (!api?.onProjectIndexUpdated || !project) return;

    return api.onProjectIndexUpdated((event) => {
      if (initialSyncProjectRef.current !== project.path) return;
      const installRelated = [...event.changedPaths, ...event.deletedPaths].some(
        (rel) =>
          rel === "package.json" ||
          rel === "package-lock.json" ||
          rel.startsWith("node_modules/@types/"),
      );
      if (installRelated) {
        typeLibsReadyRef.current = false;
        void syncMonacoProjectTypeLibs(project, readFile).then((ok) => {
          typeLibsReadyRef.current = ok;
        });
      }
      void syncMonacoChangedFiles(
        project,
        event.changedPaths,
        event.deletedPaths,
        readFile,
      );
    });
  }, [api, project, readFile]);
}
