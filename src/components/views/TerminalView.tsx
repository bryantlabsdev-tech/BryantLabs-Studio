import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";

const TERM_THEME = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  selectionBackground: "#264f78",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
} as const;

/**
 * Bottom dock "Terminal" tab — interactive shell in the open project via PTY.
 */
export function TerminalView() {
  const { project } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef<string | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.bryantlabs;
    const container = containerRef.current;
    if (!api?.terminalCreate || !project || !container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      theme: TERM_THEME,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const fitAndResize = () => {
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      const id = terminalIdRef.current;
      if (id && term.cols > 0 && term.rows > 0) {
        void api.terminalResize(id, term.cols, term.rows);
      }
    };

    let disposed = false;
    const unsubData = api.onTerminalData(({ id, data }) => {
      if (id === terminalIdRef.current) term.write(data);
    });
    const unsubExit = api.onTerminalExit(({ id, exitCode }) => {
      if (id !== terminalIdRef.current) return;
      term.writeln("");
      term.writeln(`\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
      terminalIdRef.current = null;
      setConnected(false);
      setConnectError(`Shell exited (code ${exitCode}). Click Connect shell to restart.`);
    });
    const onData = term.onData((data) => {
      const id = terminalIdRef.current;
      if (id) void api.terminalWrite(id, data);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!disposed) fitAndResize();
    });
    resizeObserver.observe(container);
    fitAndResize();

    const connectTimer = window.setTimeout(() => {
      if (disposed || terminalIdRef.current) return;
      void (async () => {
        if (!api?.terminalCreate || !project) return;
        setConnecting(true);
        setConnectError(null);
        try {
          fitAddon.fit();
          const result = await api.terminalCreate(project.path, term.cols, term.rows);
          if ("error" in result) {
            setConnectError(result.error);
            term.writeln(`\x1b[31m${result.error}\x1b[0m`);
            return;
          }
          if (disposed) {
            void api.terminalKill(result.id);
            return;
          }
          terminalIdRef.current = result.id;
          setConnected(true);
          fitAddon.fit();
          if (term.cols > 0 && term.rows > 0) {
            void api.terminalResize(result.id, term.cols, term.rows);
          }
        } finally {
          if (!disposed) setConnecting(false);
        }
      })();
    }, 120);

    return () => {
      disposed = true;
      window.clearTimeout(connectTimer);
      onData.dispose();
      unsubData();
      unsubExit();
      resizeObserver.disconnect();
      const id = terminalIdRef.current;
      if (id) void api.terminalKill(id);
      terminalIdRef.current = null;
      termRef.current = null;
      fitAddonRef.current = null;
      term.dispose();
      setConnected(false);
      setConnecting(false);
    };
  }, [project?.path]);

  const connectShell = useCallback(async () => {
    const api = window.bryantlabs;
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!api?.terminalCreate || !project || !term || connected || connecting) return;

    setConnecting(true);
    setConnectError(null);
    try {
      fitAddon?.fit();
      const result = await api.terminalCreate(project.path, term.cols, term.rows);
      if ("error" in result) {
        setConnectError(result.error);
        term.writeln(`\x1b[31m${result.error}\x1b[0m`);
        return;
      }
      terminalIdRef.current = result.id;
      setConnected(true);
      fitAddon?.fit();
      if (term.cols > 0 && term.rows > 0) {
        void api.terminalResize(result.id, term.cols, term.rows);
      }
    } finally {
      setConnecting(false);
    }
  }, [project, connected, connecting]);

  if (!project) {
    return (
      <div className="terminal-view terminal-view--empty">
        <EmptyState
          title="No project open"
          description="Open a project to run an interactive shell in its root directory."
        />
      </div>
    );
  }

  if (!window.bryantlabs?.terminalCreate) {
    return (
      <pre className="terminal__output" aria-label="Terminal unavailable">
        <span className="terminal__line terminal__line--muted">
          Interactive terminal requires the BryantLabs desktop app.
        </span>
      </pre>
    );
  }

  return (
    <div className="terminal-view">
      {!connected ? (
        <div className="terminal-view__connect">
          <button
            type="button"
            className="terminal-view__connect-btn"
            disabled={connecting}
            onClick={() => void connectShell()}
          >
            {connecting ? "Connecting…" : "Connect shell"}
          </button>
          {connectError ? (
            <p className="terminal-view__connect-error" role="alert">
              {connectError}
            </p>
          ) : (
            <p className="terminal-view__connect-hint">
              Starts an interactive shell in the project root when you are ready.
            </p>
          )}
        </div>
      ) : null}
      <div
        className="terminal-view__surface"
        ref={containerRef}
        role="region"
        aria-label="Project terminal"
      />
    </div>
  );
}
