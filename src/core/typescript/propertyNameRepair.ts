import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";

export interface PropertyRenameSuggestion {
  readonly wrong: string;
  readonly suggested: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TS2561_RE =
  /but '([^']+)' does not exist in type '[^']+'\. Did you mean to write '([^']+)'\?/;

export function parsePropertyRenameSuggestion(
  message: string,
): PropertyRenameSuggestion | null {
  const match = message.match(TS2561_RE);
  if (!match?.[1] || !match[2]) return null;
  return { wrong: match[1], suggested: match[2] };
}

/** Block renames that swap status fields for date fields (or vice versa). */
export function isSemanticallyRiskyRename(wrong: string, suggested: string): boolean {
  const wrongLower = wrong.toLowerCase();
  const suggestedLower = suggested.toLowerCase();
  const wrongIsStatus = wrongLower.includes("status");
  const wrongIsDate = wrongLower.includes("date") || wrongLower.includes("time");
  const suggestedIsStatus = suggestedLower.includes("status");
  const suggestedIsDate = suggestedLower.includes("date") || suggestedLower.includes("time");
  if (wrongIsStatus && suggestedIsDate) return true;
  if (wrongIsDate && !wrongIsStatus && suggestedIsStatus) return true;
  return false;
}

export function renamePropertyKeyInLine(
  line: string,
  wrong: string,
  suggested: string,
): string | null {
  const lineStart = line.match(new RegExp(`^(\\s*)${escapeRegExp(wrong)}(\\s*:)`));
  if (lineStart) {
    return line.replace(lineStart[0]!, `${lineStart[1]}${suggested}${lineStart[2]}`);
  }
  const inline = line.match(new RegExp(`([,{]\\s*)${escapeRegExp(wrong)}(\\s*:)`));
  if (!inline) return null;
  return line.replace(inline[0]!, `${inline[1]}${suggested}${inline[2]}`);
}

export function renamePropertyKeyInContent(
  content: string,
  wrong: string,
  suggested: string,
): string | null {
  let next = content.replace(
    new RegExp(`(\\n\\s*)${escapeRegExp(wrong)}(\\s*:)`, "g"),
    `$1${suggested}$2`,
  );
  next = next.replace(
    new RegExp(`([,{]\\s*)${escapeRegExp(wrong)}(\\s*:)`, "g"),
    `$1${suggested}$2`,
  );
  return next === content ? null : next;
}

export function renamePropertyAccessInContent(
  content: string,
  wrong: string,
  suggested: string,
): string | null {
  const accessRe = new RegExp(`\\.${escapeRegExp(wrong)}\\b`, "g");
  if (!accessRe.test(content)) return null;
  return content.replace(accessRe, `.${suggested}`);
}

export function removePropertyKeyInContent(content: string, key: string): string | null {
  const lineRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:[^\\n]*,?\\s*\\n`, "gm");
  const next = content.replace(lineRe, "");
  return next === content ? null : next;
}

export function applyWrongPropertyNameFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): { content: string; label: string } | null {
  if (diagnostic.code !== "TS2561" && diagnostic.code !== "TS2551") return null;
  const parsed = parsePropertyRenameSuggestion(diagnostic.message);
  if (parsed && isSemanticallyRiskyRename(parsed.wrong, parsed.suggested)) {
    return null;
  }
  if (!parsed) {
    const didYouMean = diagnostic.message.match(/Did you mean '([^']+)'\?/);
    const wrongAccess = diagnostic.message.match(/Property '([^']+)' does not exist/);
    if (didYouMean?.[1] && wrongAccess?.[1]) {
      const accessFixed = renamePropertyAccessInContent(content, wrongAccess[1], didYouMean[1]);
      if (accessFixed) {
        return {
          content: accessFixed,
          label: `renamed .${wrongAccess[1]} access to .${didYouMean[1]}`,
        };
      }
    }
    return null;
  }

  if (new RegExp(`\\b${escapeRegExp(parsed.suggested)}\\s*:`).test(content)) {
    const removed = removePropertyKeyInContent(content, parsed.wrong);
    if (removed) {
      return {
        content: removed,
        label: `removed duplicate ${parsed.wrong}`,
      };
    }
  }

  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx >= 0 && idx < lines.length) {
    const fixed = renamePropertyKeyInLine(lines[idx]!, parsed.wrong, parsed.suggested);
    if (fixed) {
      lines[idx] = fixed;
      return {
        content: lines.join("\n"),
        label: `renamed ${parsed.wrong} to ${parsed.suggested}`,
      };
    }
  }

  const keyFixed = renamePropertyKeyInContent(content, parsed.wrong, parsed.suggested);
  if (keyFixed) {
    return {
      content: keyFixed,
      label: `renamed ${parsed.wrong} to ${parsed.suggested}`,
    };
  }

  const accessFixed = renamePropertyAccessInContent(content, parsed.wrong, parsed.suggested);
  if (!accessFixed) return null;
  return {
    content: accessFixed,
    label: `renamed ${parsed.wrong} to ${parsed.suggested}`,
  };
}
