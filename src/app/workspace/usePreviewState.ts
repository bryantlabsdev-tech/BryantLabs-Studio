import { useCallback, useState } from "react";

export interface AppPreviewState {
  readonly url: string | null;
  readonly running: boolean;
  readonly root: string | null;
  readonly lastSuccessfulPreviewAt: number | null;
  readonly port: number | null;
}

export interface PreviewWorkspaceState {
  readonly appPreview: AppPreviewState;
  readonly previewTabNonce: number;
  readonly setAppPreview: React.Dispatch<React.SetStateAction<AppPreviewState>>;
  readonly requestPreviewTab: () => void;
  readonly patchAppPreview: (state: {
    url: string | null;
    running: boolean;
    root?: string | null;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }) => void;
}

const EMPTY_PREVIEW: AppPreviewState = {
  url: null,
  running: false,
  root: null,
  lastSuccessfulPreviewAt: null,
  port: null,
};

/** Preview URL, tab focus, and preview lifecycle state. */
export function usePreviewWorkspaceState(
  setCenterTab: React.Dispatch<React.SetStateAction<import("@/core/layout/types").CenterTab>>,
): PreviewWorkspaceState {
  const [appPreview, setAppPreview] = useState<AppPreviewState>(EMPTY_PREVIEW);
  const [previewTabNonce, setPreviewTabNonce] = useState(0);

  const requestPreviewTab = useCallback(() => {
    setPreviewTabNonce((n) => n + 1);
    setCenterTab("preview");
  }, [setCenterTab]);

  const patchAppPreview = useCallback(
    (state: {
      url: string | null;
      running: boolean;
      root?: string | null;
      lastSuccessfulPreviewAt?: number | null;
      port?: number | null;
    }) => {
      setAppPreview((prev) => ({
        url: state.url,
        running: state.running,
        root: state.root ?? prev.root,
        lastSuccessfulPreviewAt:
          state.lastSuccessfulPreviewAt ?? prev.lastSuccessfulPreviewAt,
        port: state.port ?? prev.port,
      }));
    },
    [],
  );

  return {
    appPreview,
    previewTabNonce,
    setAppPreview,
    requestPreviewTab,
    patchAppPreview,
  };
}

export { EMPTY_PREVIEW };
