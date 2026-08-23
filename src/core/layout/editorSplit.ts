/** Persisted horizontal split editor preferences. */

export const EDITOR_SPLIT_STORAGE_KEY = "bryantlabs.editor-split";

export interface EditorSplitPrefs {
  readonly enabled: boolean;
  readonly secondaryPath: string | null;
  readonly ratio: number;
}

export const EDITOR_SPLIT_DEFAULTS: EditorSplitPrefs = {
  enabled: false,
  secondaryPath: null,
  ratio: 0.5,
};

export function loadEditorSplitPrefs(): EditorSplitPrefs {
  try {
    const raw = localStorage.getItem(EDITOR_SPLIT_STORAGE_KEY);
    if (!raw) return { ...EDITOR_SPLIT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<EditorSplitPrefs>;
    const ratio =
      typeof parsed.ratio === "number" && parsed.ratio > 0.2 && parsed.ratio < 0.8
        ? parsed.ratio
        : EDITOR_SPLIT_DEFAULTS.ratio;
    return {
      enabled: parsed.enabled === true,
      secondaryPath:
        typeof parsed.secondaryPath === "string" ? parsed.secondaryPath : null,
      ratio,
    };
  } catch {
    return { ...EDITOR_SPLIT_DEFAULTS };
  }
}

export function saveEditorSplitPrefs(prefs: EditorSplitPrefs): void {
  try {
    localStorage.setItem(EDITOR_SPLIT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}
