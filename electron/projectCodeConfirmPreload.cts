import { ipcRenderer } from "electron";

const nonceArg = process.argv.find((arg) => arg.startsWith("--project-code-nonce="));
const nonce = nonceArg?.slice("--project-code-nonce=".length) ?? "";

declare const document: {
  getElementById(id: string): { textContent: string; addEventListener(type: string, listener: () => void): void } | null;
};

declare function addEventListener(type: string, listener: () => void): void;

function setText(id: string, value: unknown): void {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = typeof value === "string" ? value : "";
}

addEventListener("DOMContentLoaded", () => {
  document.getElementById("approve")?.addEventListener("click", () => {
    ipcRenderer.send("agent:projectCodeChallenge", { nonce, decision: "approve" });
  });
  document.getElementById("cancel")?.addEventListener("click", () => {
    ipcRenderer.send("agent:projectCodeChallenge", { nonce, decision: "cancel" });
  });
});

ipcRenderer.on("project-code-confirm-details", (_event, details: unknown) => {
  const record = details && typeof details === "object" ? (details as Record<string, unknown>) : {};
  setText("path-behavior", record.pathBehavior);
  setText("executable", record.executable);
  setText("arguments", record.arguments);
  setText("cwd", record.workingDirectory);
  setText("network", record.networkLimitation);
  setText("timeout", record.timeout);
  setText("digest", record.digest);
  setText("risk", record.risk);
});
