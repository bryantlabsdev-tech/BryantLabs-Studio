import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** Electron webview tag (preview embed). */
declare namespace Electron {
  interface WebviewTag extends HTMLElement {
    src: string;
    partition: string;
    reload(): void;
    executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
    addEventListener(
      type: "did-start-loading" | "did-finish-load" | "did-fail-load" | "console-message",
      listener: (event: Event) => void,
    ): void;
    removeEventListener(
      type: "did-start-loading" | "did-finish-load" | "did-fail-load" | "console-message",
      listener: (event: Event) => void,
    ): void;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<Electron.WebviewTag>,
        Electron.WebviewTag
      > & {
        src?: string;
        partition?: string;
        allowpopups?: boolean;
      };
    }
  }
}

export {};
