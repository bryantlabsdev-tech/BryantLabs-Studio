import type { BrowserWindow, IpcMain } from "electron";
import * as path from "node:path";
import * as pty from "node-pty";

interface TerminalSession {
  readonly pty: pty.IPty;
  readonly cwd: string;
}

const sessions = new Map<string, TerminalSession>();

function defaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }
  return process.env.SHELL ?? "/bin/zsh";
}

function sendToRenderer(
  getMainWindow: () => BrowserWindow | null,
  channel: string,
  payload: unknown,
): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function detachSession(id: string): TerminalSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  sessions.delete(id);
  return session;
}

export function destroyAllTerminals(): void {
  for (const id of [...sessions.keys()]) {
    const session = detachSession(id);
    if (!session) continue;
    try {
      session.pty.kill();
    } catch {
      /* already dead */
    }
  }
}

export function registerTerminalIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  isWithinProject: (target: string) => boolean,
): void {
  ipcMain.handle(
    "terminal:create",
    async (
      _event,
      cwd: string,
      cols?: number,
      rows?: number,
    ): Promise<{ id: string } | { error: string }> => {
      if (typeof cwd !== "string" || cwd.length === 0) {
        return { error: "Invalid working directory." };
      }
      const resolved = path.resolve(cwd);
      if (!isWithinProject(resolved)) {
        return { error: "Working directory is outside the open project." };
      }

      const safeCols =
        typeof cols === "number" && Number.isFinite(cols) && cols > 0
          ? Math.min(Math.floor(cols), 500)
          : 80;
      const safeRows =
        typeof rows === "number" && Number.isFinite(rows) && rows > 0
          ? Math.min(Math.floor(rows), 200)
          : 24;

      const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const shell = defaultShell();

      let proc: pty.IPty;
      try {
        proc = pty.spawn(shell, [], {
          name: "xterm-256color",
          cols: safeCols,
          rows: safeRows,
          cwd: resolved,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
          } as Record<string, string>,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to spawn shell.";
        return { error: message };
      }

      sessions.set(id, { pty: proc, cwd: resolved });

      proc.onData((data) => {
        if (!sessions.has(id)) return;
        sendToRenderer(getMainWindow, "terminal:data", { id, data });
      });

      proc.onExit(({ exitCode }) => {
        detachSession(id);
        sendToRenderer(getMainWindow, "terminal:exit", { id, exitCode });
      });

      return { id };
    },
  );

  ipcMain.handle(
    "terminal:write",
    async (_event, id: string, data: string): Promise<{ ok: boolean; reason?: string }> => {
      if (typeof id !== "string" || typeof data !== "string") {
        return { ok: false, reason: "Invalid write request." };
      }
      const session = sessions.get(id);
      if (!session) {
        return { ok: false, reason: "Terminal session not found." };
      }
      try {
        session.pty.write(data);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Write failed.";
        return { ok: false, reason: message };
      }
    },
  );

  ipcMain.handle(
    "terminal:resize",
    async (
      _event,
      id: string,
      cols: number,
      rows: number,
    ): Promise<{ ok: boolean; reason?: string }> => {
      if (typeof id !== "string") {
        return { ok: false, reason: "Invalid resize request." };
      }
      const session = sessions.get(id);
      if (!session) {
        return { ok: false, reason: "Terminal session not found." };
      }
      const safeCols =
        typeof cols === "number" && Number.isFinite(cols) && cols > 0
          ? Math.min(Math.floor(cols), 500)
          : 80;
      const safeRows =
        typeof rows === "number" && Number.isFinite(rows) && rows > 0
          ? Math.min(Math.floor(rows), 200)
          : 24;
      try {
        session.pty.resize(safeCols, safeRows);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Resize failed.";
        return { ok: false, reason: message };
      }
    },
  );

  ipcMain.handle(
    "terminal:kill",
    async (_event, id: string): Promise<{ ok: boolean }> => {
      if (typeof id !== "string") return { ok: false };
      const session = detachSession(id);
      if (!session) return { ok: false };
      try {
        session.pty.kill();
      } catch {
        /* ignore */
      }
      return { ok: true };
    },
  );
}
