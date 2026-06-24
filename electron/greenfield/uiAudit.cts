import { BrowserWindow } from "electron";
import { buildDomAuditScript } from "./uiAuditDomScript.cjs";
import type { UiAuditSnapshotTransport, UiDomSnapshot } from "./uiAuditTypes.cjs";

const AUDIT_LOAD_TIMEOUT_MS = 20_000;
const AUDIT_RENDER_WAIT_MS = 800;
const AUDIT_RENDER_POLL_MS = 250;
const AUDIT_RENDER_MAX_WAIT_MS = 6_000;

const ROOT_READY_SCRIPT = `(() => {
  const root = document.querySelector("#root");
  if (!root) return false;
  const panels = root.querySelectorAll(".panel-card, .panel, aside, nav");
  if (panels.length >= 2) {
    return [...panels].some((p) => p.getBoundingClientRect().height >= 40);
  }
  if ((root.textContent?.trim().length ?? 0) > 0) return true;
  return root.querySelector("main, h1, table") != null;
})()`;

export type { UiAuditSnapshotTransport, UiDomSnapshot } from "./uiAuditTypes.cjs";

export async function collectPreviewDomSnapshot(
  url: string,
): Promise<UiAuditSnapshotTransport> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Preview UI audit timed out loading page."));
      }, AUDIT_LOAD_TIMEOUT_MS);
      win.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve();
      });
      win.webContents.once(
        "did-fail-load",
        (_event, _code, description) => {
          clearTimeout(timer);
          reject(new Error(description || "Preview page failed to load."));
        },
      );
      void win.loadURL(url).catch(reject);
    });

    await new Promise((r) => setTimeout(r, AUDIT_RENDER_WAIT_MS));

    const renderDeadline = Date.now() + AUDIT_RENDER_MAX_WAIT_MS;
    while (Date.now() < renderDeadline) {
      const ready = (await win.webContents.executeJavaScript(
        ROOT_READY_SCRIPT,
        true,
      )) as boolean;
      if (ready) break;
      await new Promise((r) => setTimeout(r, AUDIT_RENDER_POLL_MS));
    }

    const snapshot = (await win.webContents.executeJavaScript(
      buildDomAuditScript(),
      true,
    )) as UiDomSnapshot;

    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      snapshot: null,
      error: err instanceof Error ? err.message : "UI audit failed.",
    };
  } finally {
    win.destroy();
  }
}

export async function auditGreenfieldPreviewUrl(
  url: string,
): Promise<UiAuditSnapshotTransport> {
  return collectPreviewDomSnapshot(url);
}
