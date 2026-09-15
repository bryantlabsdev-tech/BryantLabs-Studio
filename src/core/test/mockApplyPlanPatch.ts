import type { PatchTargetFile } from "@/core/planner/aiTypes";
import { normalizeApplyPlanPath } from "@/core/planApply/markedFileParse";
import type { ApplyPlanBatchPatchResult } from "@/core/planApply/types";

export const MOCK_PROVIDER_MODEL = "mock-deterministic";

function isGameplayPrompt(promptLower: string): boolean {
  return (
    /\b(notes mode|hint system|hints|mistake counter|game over|win modal|gameplay|keyboard controls|statistics panel|difficulty selector|matching numbers)\b/.test(
      promptLower,
    ) ||
    /\b(easier to play|real sudoku|enjoyable to play)\b/.test(promptLower)
  );
}

const MOCK_TIMER_MARKER = "// mock: timer enhancement";

function isTimerFollowUpPrompt(promptLower: string): boolean {
  if (isGameplayPrompt(promptLower)) return false;
  return /\badd a timer\b/.test(promptLower) || /\btimer\b/.test(promptLower);
}

function applyTimerAppPatch(content: string): string {
  if (content.includes(MOCK_TIMER_MARKER)) {
    return `${content.trimEnd()}\nexport const MOCK_TIMER_BUMP = true;\n`;
  }
  return `${content.trimEnd()}\n${MOCK_TIMER_MARKER}\nexport const MOCK_TIMER = true;\n`;
}

function patchAppTsx(content: string, promptLower: string): string {
  if (isTimerFollowUpPrompt(promptLower)) {
    return applyTimerAppPatch(content);
  }
  if (isGameplayPrompt(promptLower)) {
    const marker = "// mock: gameplay upgrade";
    if (content.includes(marker)) return content;
    return `${content.trimEnd()}\n${marker}\nexport const MOCK_GAMEPLAY = true;\n`;
  }
  if (/\b(mobile|responsive|layout)\b/.test(promptLower)) {
    const marker = "/* mock: responsive layout */";
    if (content.includes(marker)) return content;
    return content.replace("<main", `${marker}\n<main`);
  }
  if (/\b(build|typescript|typecheck|fix)\b/.test(promptLower)) {
    const marker = "// mock: build fix";
    if (content.includes(marker)) return content;
    return content.replace(/export function App\(\)/, `${marker}\nexport function App()`);
  }
  if (promptLower.includes("history")) {
    const marker = "// mock: calculator history";
    if (content.includes(marker)) return content;
    return `${content.trimEnd()}\n${marker}\n`;
  }
  return `${content.trimEnd()}\n// mock apply\n`;
}

function patchIndexCss(content: string, promptLower: string): string {
  if (isGameplayPrompt(promptLower)) {
    return `${content.trimEnd()}\n.mock-gameplay { display: block; }\n`;
  }
  if (/\b(mobile|responsive|layout|blue|style|css|premium|theme)\b/.test(promptLower)) {
    return `${content.trimEnd()}\n.responsive-mock { max-width: 100%; }\n`;
  }
  return `${content.trimEnd()}\n/* mock styles */\n`;
}

function patchPageTsx(content: string): string {
  const marker = "// mock: page edit";
  if (content.includes(marker)) return content;
  return `${content.trimEnd()}\n${marker}\n`;
}

/** Deterministic Apply Plan batch patch (mirrors electron mockProvider). */
export function mockApplyPlanBatchPatch(
  userPrompt: string,
  files: readonly PatchTargetFile[],
): ApplyPlanBatchPatchResult {
  const promptLower = userPrompt.toLowerCase();
  const out: Record<string, string> = {};
  for (const file of files) {
    const path = normalizeApplyPlanPath(file.path);
    if (path === "src/App.tsx") {
      out[path] = patchAppTsx(file.content, promptLower);
    } else if (path === "src/index.css") {
      out[path] = patchIndexCss(file.content, promptLower);
    } else if (path === "src/components/History.tsx" || path.endsWith("/History.tsx")) {
      out[path] = `export function History() {
  return <section aria-label="calculation history">History</section>;
}
`;
    } else if (path.endsWith(".tsx") || path.endsWith(".ts")) {
      out[path] = patchPageTsx(file.content);
    } else {
      out[path] = `${file.content.trimEnd()}\n/* mock patch */\n`;
    }
  }
  const rawText = Object.entries(out)
    .map(([p, c]) => `@@FILE:${p}\n${c}\n@@END`)
    .join("\n\n");
  return {
    ok: true,
    provider: "gemini",
    model: MOCK_PROVIDER_MODEL,
    raw: { mock: true },
    rawText,
    latencyMs: 5,
    files: out,
    repairAttempted: false,
    directRewrite: false,
  };
}
