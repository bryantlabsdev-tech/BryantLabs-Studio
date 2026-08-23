import { useEffect, useState } from "react";

const STORAGE_KEY = "bryantlabs.developerDiagnosticsEnabled";
export const DEVELOPER_DIAGNOSTICS_EVENT = "bryantlabs:developer-diagnostics";

export function readDeveloperDiagnosticsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDeveloperDiagnosticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DEVELOPER_DIAGNOSTICS_EVENT, { detail: { enabled } }),
    );
  }
}

export function useDeveloperDiagnosticsEnabled(): readonly [
  boolean,
  (enabled: boolean) => void,
] {
  const [enabled, setEnabled] = useState(readDeveloperDiagnosticsEnabled);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") {
        setEnabled(detail.enabled);
        return;
      }
      setEnabled(readDeveloperDiagnosticsEnabled());
    };
    window.addEventListener(DEVELOPER_DIAGNOSTICS_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(DEVELOPER_DIAGNOSTICS_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setDeveloperDiagnosticsEnabled = (next: boolean) => {
    setEnabled(next);
    writeDeveloperDiagnosticsEnabled(next);
  };

  return [enabled, setDeveloperDiagnosticsEnabled];
}
