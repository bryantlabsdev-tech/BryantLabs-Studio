import { redactSecrets } from "./debug.cjs";
import { GREENFIELD_PATHS, type GreenfieldPath } from "./paths.cjs";

const PREVIEW_CHARS = 2000;

function markerStart(p: string): string {
  return `@@FILE:${p}@@`;
}
function markerEnd(p: string): string {
  return `@@END:${p}@@`;
}

/** Read-only marker audit — does not replace or alter the parser. */
export interface GreenfieldMarkerAudit {
  requiredFiles: readonly GreenfieldPath[];
  detectedFileStarts: GreenfieldPath[];
  detectedFileEnds: GreenfieldPath[];
  completeMarkerPairs: GreenfieldPath[];
  missingFiles: GreenfieldPath[];
  rawResponsePreview: string;
  promptCharCount: number;
  /** Full prompt sent to the provider (no API keys in greenfield prompts). */
  promptSent: string;
  hasExampleOutputFormat: boolean;
  explicitlyRequiresAllSeven: boolean;
}

export function auditGreenfieldMarkers(
  rawText: string,
  promptSent: string,
): GreenfieldMarkerAudit {
  const detectedFileStarts: GreenfieldPath[] = [];
  const detectedFileEnds: GreenfieldPath[] = [];
  const completeMarkerPairs: GreenfieldPath[] = [];
  const missingFiles: GreenfieldPath[] = [];

  for (const rel of GREENFIELD_PATHS) {
    const startIdx = rawText.indexOf(markerStart(rel));
    const endIdx = rawText.indexOf(markerEnd(rel));
    if (startIdx !== -1) detectedFileStarts.push(rel);
    if (endIdx !== -1) detectedFileEnds.push(rel);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      missingFiles.push(rel);
      continue;
    }
    const body = rawText
      .slice(startIdx + markerStart(rel).length, endIdx)
      .replace(/^\r?\n/, "")
      .replace(/\r?\n$/, "");
    if (body.length === 0) missingFiles.push(rel);
    else completeMarkerPairs.push(rel);
  }

  return {
    requiredFiles: GREENFIELD_PATHS,
    detectedFileStarts,
    detectedFileEnds,
    completeMarkerPairs,
    missingFiles,
    rawResponsePreview: redactSecrets(rawText.slice(0, PREVIEW_CHARS)),
    promptCharCount: promptSent.length,
    promptSent,
    hasExampleOutputFormat:
      promptSent.includes("@@FILE:<path>@@") &&
      promptSent.includes("@@END:<path>@@"),
    explicitlyRequiresAllSeven:
      /Required files \(exact paths\)/i.test(promptSent) &&
      GREENFIELD_PATHS.every((p) => promptSent.includes(p)),
  };
}
