import { redactSecrets } from "@/core/greenfield/debug";
import {
  GREENFIELD_FILE_PATHS,
  type GreenfieldFilePath,
} from "@/core/greenfield/types";

const PREVIEW_CHARS = 2000;

export interface GreenfieldMarkerAudit {
  requiredFiles: readonly GreenfieldFilePath[];
  detectedFileStarts: GreenfieldFilePath[];
  detectedFileEnds: GreenfieldFilePath[];
  completeMarkerPairs: GreenfieldFilePath[];
  missingFiles: GreenfieldFilePath[];
  rawResponsePreview: string;
  promptCharCount: number;
  promptSent: string;
  hasExampleOutputFormat: boolean;
  explicitlyRequiresAllSeven: boolean;
}

function markerStart(p: string): string {
  return `@@FILE:${p}@@`;
}

function markerEnd(p: string): string {
  return `@@END:${p}@@`;
}

export function auditGreenfieldMarkers(
  rawText: string,
  promptSent = "",
): GreenfieldMarkerAudit {
  const detectedFileStarts: GreenfieldFilePath[] = [];
  const detectedFileEnds: GreenfieldFilePath[] = [];
  const completeMarkerPairs: GreenfieldFilePath[] = [];
  const missingFiles: GreenfieldFilePath[] = [];

  for (const rel of GREENFIELD_FILE_PATHS) {
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
    requiredFiles: GREENFIELD_FILE_PATHS,
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
      GREENFIELD_FILE_PATHS.every((p) => promptSent.includes(p)),
  };
}
