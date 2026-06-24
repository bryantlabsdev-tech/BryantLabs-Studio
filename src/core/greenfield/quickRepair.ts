import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import {
  shouldAlignUseStateWithRelaxedMock,
  shouldRelaxMockEntityTypes,
} from "@/core/greenfield/repairConvergencePolicy";
import { repairTruncatedLines } from "@/core/greenfield/generatedSourceHardening";
import {
  contentHasMarkerArtifacts,
  stripMarkerArtifactsFromContent,
} from "@/core/greenfield/markerContentSanitizer";
import {
  applyMissingPropertyFix,
  applyRecordLiteralKeyFix,
  parseMissingPropertyError,
  type ReadProjectFile,
} from "@/core/typescript/missingPropertyRepair";
import { applyGreenfieldFileLevelFixes, ensureReactRouterImports } from "@/core/typescript/greenfieldQuickFixes";
import { applyExportImportFix } from "@/core/typescript/exportImportRepair";
import {
  applyTs2307MissingModuleFix,
  applyTs2353LiteralPropertyFix,
  applyTs2353TypeAugmentation,
  applyUnionLiteralAugmentation,
  parseTs2353Error,
} from "@/core/typescript/typeShapeRepair";
import { applyWrongPropertyNameFix } from "@/core/typescript/propertyNameRepair";
import { simplifyIntersectionTypeInFile, relaxMockArrayAnnotation, relaxExhaustiveRecordAnnotation, alignUseStateWithRelaxedMock } from "@/core/typescript/intersectionTypeRepair";
import { completeObjectLiteralForType } from "@/core/typescript/objectLiteralCompletion";
import {
  applyStringToArrayFix,
  applyUndefinedIndexFix,
  repairMisplacedStatusInDateField,
  wrapAllScalarArrayProperties,
  completeMockDocumentUrls,
  completeMockScheduleItemTimes,
  mapInvalidDocumentTypeLiterals,
  addStatusFallbackForBadgeProps,
  collapseRepeatedPropertyLines,
  repairBrokenDocumentMockArray,
} from "@/core/typescript/mockDataRepair";
import { applyOptionalAccessFix } from "@/core/typescript/optionalAccessRepair";
import { applyUnionLiteralValueFix } from "@/core/typescript/unionLiteralRepair";
import { fixNumberToStringLiteral, fixPrimitiveTypeMismatchInTypes, fixStringToNumberLiteral } from "@/core/typescript/projectWideRepairs";
import { applySyntaxCorruptionRepairs } from "@/core/typescript/syntaxCorruptionRepair";
import { ensureReactHookImports } from "@/core/typescript/reactHookImports";
import {
  applyUnusedSymbolFix,
  extractUnusedSymbol,
} from "@/core/typescript/unusedCleanup";

export { extractUnusedSymbol } from "@/core/typescript/unusedCleanup";
export type { ReadProjectFile } from "@/core/typescript/missingPropertyRepair";

export const QUICK_REPAIR_CODES = new Set([
  "TS6133",
  "TS6196",
  "TS6192",
  "TS2322",
  "TS2678",
  "TS2345",
  "TS7006",
  "TS2304",
  "TS2552",
  "TS1109",
  "TS2739",
  "TS2741",
  "TS2613",
  "TS2614",
  "TS2353",
  "TS2561",
  "TS2551",
  "TS2307",
  "TS2820",
  "TS2740",
  "TS18048",
  "TS2538",
]);

export function isQuickRepairableDiagnostic(d: TypeScriptDiagnostic): boolean {
  return d.category === "error" && QUICK_REPAIR_CODES.has(d.code);
}

export function setupHasQuickRepairableErrors(
  diagnostics: readonly TypeScriptDiagnostic[],
): boolean {
  return diagnostics.some(isQuickRepairableDiagnostic);
}

function normalizeRelPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineAt(content: string, lineNumber: number): string | null {
  const lines = content.split("\n");
  const idx = lineNumber - 1;
  return idx >= 0 && idx < lines.length ? lines[idx]! : null;
}

function isUnsafeToRemoveUnusedDeclaration(line: string, symbol: string): boolean {
  if (/\bfor\s*\(/.test(line)) return true;
  if (/\bwhile\s*\(/.test(line)) return true;
  if (/\bcatch\s*\(/.test(line)) return true;
  if (/=>/.test(line)) return true;
  if (/\b(import|export)\b/.test(line)) return true;
  if (/\b(?:const|let|var)\s/.test(line) && line.includes(symbol)) {
    return true;
  }
  return false;
}

function prefixUnusedSymbolAtLine(
  content: string,
  lineNumber: number,
  symbol: string,
): string | null {
  if (symbol.startsWith("_")) return null;
  const lines = content.split("\n");
  const idx = lineNumber - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx]!;

  const paramPrefixed = prefixUnusedParameterOnLine(line, symbol);
  if (paramPrefixed != null) {
    lines[idx] = paramPrefixed;
    return lines.join("\n");
  }

  const re = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");
  if (!re.test(line)) return null;
  lines[idx] = line.replace(re, `_${symbol}`);
  return lines.join("\n");
}

function prefixUnusedParameterOnLine(line: string, symbol: string): string | null {
  if (symbol.startsWith("_")) return null;

  const arrowAssign = line.match(/^(\s*(?:const|let)\s+\w+\s*=\s*)\(([^)]*)\)(\s*=>)/);
  if (arrowAssign) {
    const [, head, params, tail] = arrowAssign;
    const nextParams = prefixSymbolInParamList(params!, symbol);
    if (nextParams != null) {
      return line.replace(arrowAssign[0], `${head}(${nextParams})${tail}`);
    }
  }

  const fnMatch = line.match(/^(\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*)\(([^)]*)\)/);
  if (fnMatch) {
    const [, head, params] = fnMatch;
    const nextParams = prefixSymbolInParamList(params!, symbol);
    if (nextParams != null) {
      return line.replace(fnMatch[0], `${head}(${nextParams})`);
    }
  }

  return null;
}

function splitTopLevelParams(params: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of params) {
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function prefixSymbolInParamList(params: string, symbol: string): string | null {
  const parts = splitTopLevelParams(params);
  let changed = false;
  const next = parts.map((part) => {
    const bare = part.trim().split(/\s*:/)[0]!.split(/\s*=/)[0]!.trim();
    if (bare !== symbol || bare.startsWith("_")) return part;
    changed = true;
    return part.replace(new RegExp(`^\\s*${escapeRegExp(symbol)}\\b`), `_${symbol}`);
  });
  return changed ? next.join(", ") : null;
}

function applyTs2322LineFix(line: string, message: string): string | null {
  if (/undefined/.test(message) && /null/.test(message)) {
    if (line.includes("undefined")) return line.replace(/\bundefined\b/, "null");
  }
  if (/null/.test(message) && /undefined/.test(message)) {
    if (line.includes("null")) return line.replace(/\bnull\b/, "undefined");
  }
  return null;
}

function applyTs7006LineFix(line: string): string | null {
  const m = line.match(/^(\s*(?:function\s+\w+\s*|\([^)]*\)\s*=>|\w+\s*\())\(([^)]*)\)/);
  if (!m) return null;
  const params = m[2]!.split(",").map((p) => {
    const trimmed = p.trim();
    if (!trimmed || trimmed.includes(":")) return trimmed;
    return `${trimmed}: unknown`;
  });
  return line.replace(m[0], m[0].replace(m[2]!, params.join(", ")));
}

function applyTs2552Suggestion(line: string, message: string): string | null {
  const m =
    message.match(/Did you mean '([^']+)'\?/) ??
    message.match(/Did you mean to write '([^']+)'\?/);
  if (!m) return null;
  const suggested = m[1]!;
  const wrongProperty = message.match(/but '([^']+)' does not exist/);
  if (wrongProperty?.[1] && line.includes(`${wrongProperty[1]}:`)) {
    return line.replace(new RegExp(`\\b${wrongProperty[1]}\\b`), suggested);
  }
  const wrongLiteral = message.match(/Type '([^']+)' is not assignable/);
  if (wrongLiteral?.[1]) {
    const wrong = wrongLiteral[1];
    if (line.includes(wrong)) {
      return line.replace(wrong, suggested);
    }
  }
  const wrong = message.match(/Cannot find name '([^']+)'/);
  if (!wrong) return null;
  if (!line.includes(wrong[1]!)) return null;
  return line.replaceAll(wrong[1]!, suggested);
}

function extractNullableCallArgument(line: string): string | null {
  const callMatch = line.match(/\(([^()]*)\)\s*;?\s*$/);
  if (!callMatch) return null;
  const args = callMatch[1]!
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = args[args.length - 1];
  if (!last) return null;
  const bare = last.replace(/[);]+$/g, "").trim();
  return /^[A-Za-z_$][\w$.]*$/.test(bare) ? bare : null;
}

function extractExpressionAt(line: string, column: number): string | null {
  const fromCall = extractNullableCallArgument(line.trim());
  if (fromCall) return fromCall;

  const col = Math.max(0, Math.min(column - 1, line.length - 1));
  const before = line.slice(0, col + 1);
  const trailing = before.match(/([A-Za-z_$][\w$.]*)\s*$/);
  if (trailing?.[1]) return trailing[1];

  let start = col;
  while (start > 0 && /[\w$.]/.test(line[start - 1]!)) start -= 1;
  let end = col;
  while (end < line.length && /[\w$.]/.test(line[end]!)) end += 1;

  const expr = line.slice(start, end).trim();
  return expr.length > 0 ? expr : null;
}

function inferGuardReturn(trimmedLine: string): string {
  if (trimmedLine.startsWith("return ")) {
    const value = trimmedLine.slice(7).trim();
    if (/^true\b/.test(value)) return "return false;";
    if (/^false\b/.test(value)) return "return true;";
    if (/^null\b/.test(value)) return "return null;";
    if (/^undefined\b/.test(value)) return "return undefined;";
    if (/^0\b/.test(value)) return "return 0;";
    if (/^['"`]/.test(value)) return "return '';";
    return "return false;";
  }
  return "return;";
}

function applyTs2345LineFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
): string | null {
  if (diagnostic.code !== "TS2345") return null;
  if (!/not assignable to parameter of type/.test(diagnostic.message)) return null;

  const argTypeMatch = diagnostic.message.match(/Argument of type '([^']+)'/);
  const paramTypeMatch = diagnostic.message.match(/parameter of type '([^']+)'/);
  if (!argTypeMatch || !paramTypeMatch) return null;

  const argType = argTypeMatch[1]!;
  const paramType = paramTypeMatch[1]!;
  const argNullable = /\|\s*(null|undefined)/.test(argType);
  const paramNullable = /\|\s*(null|undefined)/.test(paramType);
  if (!argNullable || paramNullable) return null;

  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const line = lines[idx]!;
  if (/<[A-Za-z]/.test(line)) {
    const argExpr = extractExpressionAt(line, diagnostic.column);
    if (!argExpr) return null;
    const fallback = /status/i.test(argExpr) ? '"sent"' : '""';
    const fixed = line.replace(
      new RegExp(`${escapeRegExp(argExpr)}(?=\\))`),
      `${argExpr} ?? ${fallback}`,
    );
    if (fixed === line) return null;
    lines[idx] = fixed;
    return lines.join("\n");
  }
  const argExpr = extractExpressionAt(line, diagnostic.column);
  if (!argExpr) return null;

  const indent = line.match(/^(\s*)/)?.[1] ?? "";
  const guard = `${indent}if (${argExpr} == null) ${inferGuardReturn(line.trim())}`;
  if (lines[idx - 1]?.includes(`if (${argExpr} == null)`)) return null;

  lines.splice(idx, 0, guard);
  return lines.join("\n");
}

function applyDiagnosticFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
  relPath = "",
): { content: string; label: string } | null {
  const normalizedPath = normalizeRelPath(relPath || diagnostic.file);

  if (diagnostic.code === "TS1109") {
    const line = lineAt(content, diagnostic.line);
    if (line && contentHasMarkerArtifacts(line)) {
      const lines = content.split("\n");
      lines.splice(diagnostic.line - 1, 1);
      const next = stripMarkerArtifactsFromContent(lines.join("\n"));
      return { content: next, label: "removed leaked marker line" };
    }
    const truncated = repairTruncatedLines(content);
    if (truncated.removedLines > 0) {
      return {
        content: truncated.content,
        label: `removed ${truncated.removedLines} truncated line(s)`,
      };
    }
    if (contentHasMarkerArtifacts(content)) {
      const next = stripMarkerArtifactsFromContent(content);
      if (next !== content) {
        return { content: next, label: "stripped leaked marker artifacts" };
      }
    }
  }

  switch (diagnostic.code) {
    case "TS6133":
    case "TS6196":
    case "TS6192": {
      if (diagnostic.code === "TS6192") {
        const lines = content.split("\n");
        const idx = diagnostic.line - 1;
        if (idx >= 0 && idx < lines.length && /^\s*import\s+/.test(lines[idx]!)) {
          lines.splice(idx, 1);
          return { content: lines.join("\n"), label: "removed unused import declaration" };
        }
      }
      const removed = applyUnusedSymbolFix(content, diagnostic);
      if (removed) return removed;
      const symbol = extractUnusedSymbol(diagnostic.message);
      if (!symbol) return null;
      const line = lineAt(content, diagnostic.line);
      if (line && isUnsafeToRemoveUnusedDeclaration(line, symbol)) {
        const prefixed = prefixUnusedSymbolAtLine(content, diagnostic.line, symbol);
        if (prefixed != null) {
          return { content: prefixed, label: `prefixed unused ${symbol} with _` };
        }
      }
      return null;
    }
    case "TS2322": {
      if (parseMissingPropertyError(diagnostic.code, diagnostic.message)) {
        return null;
      }
      const simplified = simplifyIntersectionTypeInFile(content, diagnostic);
      if (simplified) {
        return { content: simplified, label: "simplified incompatible intersection type" };
      }
      const targetType = diagnostic.message.match(/is not assignable to type '([^']+)'/)?.[1];
      if (
        targetType &&
        /^[A-Z]/.test(targetType) &&
        !targetType.includes(" & ") &&
        shouldRelaxMockEntityTypes(normalizedPath)
      ) {
        const relaxed = relaxMockArrayAnnotation(content, targetType.replace(/\[\]$/, ""));
        if (relaxed) {
          return { content: relaxed, label: `relaxed mock annotation for ${targetType}` };
        }
      }
      const stringToNumber = fixStringToNumberLiteral(content, diagnostic);
      if (stringToNumber) {
        return { content: stringToNumber, label: "restored quoted number literal" };
      }
      const stringToArray = applyStringToArrayFix(content, diagnostic);
      if (stringToArray) {
        return stringToArray;
      }
      const lines = content.split("\n");
      const idx = diagnostic.line - 1;
      if (idx < 0 || idx >= lines.length) return null;
      const fixed = applyTs2322LineFix(lines[idx]!, diagnostic.message);
      if (!fixed) return null;
      lines[idx] = fixed;
      return { content: lines.join("\n"), label: "fixed undefined/null mismatch" };
    }
    case "TS2740": {
      const relaxed = relaxExhaustiveRecordAnnotation(content);
      if (relaxed) {
        return { content: relaxed, label: "relaxed exhaustive Record annotation" };
      }
      return null;
    }
    case "TS2739":
    case "TS2741":
      return null;
    case "TS2345": {
      const fixed = applyTs2345LineFix(content, diagnostic);
      if (!fixed) return null;
      return { content: fixed, label: "added null guard before call" };
    }
    case "TS7006": {
      const lines = content.split("\n");
      const idx = diagnostic.line - 1;
      if (idx < 0 || idx >= lines.length) return null;
      const fixed = applyTs7006LineFix(lines[idx]!);
      if (!fixed) return null;
      lines[idx] = fixed;
      return { content: lines.join("\n"), label: "added explicit parameter type" };
    }
    case "TS2561":
    case "TS2551": {
      const renamed = applyWrongPropertyNameFix(content, diagnostic);
      if (renamed) return renamed;
      return null;
    }
    case "TS18048": {
      const fixed = applyOptionalAccessFix(content, diagnostic);
      if (!fixed) return null;
      return fixed;
    }
    case "TS2538": {
      const fixed = applyUndefinedIndexFix(content, diagnostic);
      if (!fixed) return null;
      return fixed;
    }
    case "TS2552":
    case "TS2820": {
      const lines = content.split("\n");
      const idx = diagnostic.line - 1;
      if (idx < 0 || idx >= lines.length) return null;
      const fixed = applyTs2552Suggestion(lines[idx]!, diagnostic.message);
      if (!fixed) return null;
      lines[idx] = fixed;
      return { content: lines.join("\n"), label: "applied typo suggestion" };
    }
    case "TS2307": {
      const fixed = applyTs2307MissingModuleFix(content, diagnostic, normalizeRelPath(relPath));
      if (!fixed) return null;
      return fixed;
    }
    case "TS2304": {
      const missing = diagnostic.message.match(/Cannot find name '([^']+)'/);
      const symbol = missing?.[1];
      if (!symbol) return null;
      if (/^use[A-Z]/.test(symbol)) {
        const next = ensureReactHookImports(content);
        if (!next || next === content) return null;
        return { content: next, label: `added missing React import for ${symbol}` };
      }
      if (/^(Route|Routes|Link|NavLink|Outlet|useNavigate|useParams|useLocation)$/.test(symbol)) {
        const next = ensureReactRouterImports(content);
        if (!next || next === content) return null;
        return { content: next, label: `added missing react-router import for ${symbol}` };
      }
      return null;
    }
    default:
      return null;
  }
}

export function applyQuickRepairsForFile(
  relPath: string,
  content: string,
  diagnostics: readonly TypeScriptDiagnostic[],
): { content: string; fixes: string[] } | null {
  return applyQuickRepairsForFileSync(relPath, content, diagnostics);
}

function applyQuickRepairsForFileSync(
  relPath: string,
  content: string,
  diagnostics: readonly TypeScriptDiagnostic[],
): { content: string; fixes: string[] } | null {
  const normalized = normalizeRelPath(relPath);
  const fileDiags = diagnostics
    .filter((d) => normalizeRelPath(d.file) === normalized && isQuickRepairableDiagnostic(d))
    .sort((a, b) => b.line - a.line);
  if (fileDiags.length === 0) return null;

  let next = content;
  const fixes: string[] = [];
  for (const diagnostic of fileDiags) {
    const result = applyDiagnosticFix(next, diagnostic, normalized);
    if (!result) continue;
    next = result.content;
    fixes.push(result.label);
  }

  if (fixes.length === 0 || next === content) return null;
  if (/\.tsx?$/.test(normalized)) {
    const hooksFixed = ensureReactHookImports(next);
    if (hooksFixed) {
      next = hooksFixed;
      fixes.push("ensured React hook imports");
    }
  }
  return { content: next, fixes };
}

export async function applyQuickRepairsForFileAsync(
  relPath: string,
  content: string,
  diagnostics: readonly TypeScriptDiagnostic[],
  readFile?: ReadProjectFile,
): Promise<{ content: string; fixes: string[]; extraFiles?: Record<string, string> } | null> {
  let next = content;
  const fixes: string[] = [];
  const extraFiles: Record<string, string> = {};

  const fileLevel = applyGreenfieldFileLevelFixes(relPath, next);
  if (fileLevel) {
    next = fileLevel.content;
    fixes.push(...fileLevel.fixes);
  }

  const syntaxFixed = applySyntaxCorruptionRepairs(next);
  if (syntaxFixed) {
    next = syntaxFixed;
    fixes.push("repaired corrupted record literal");
  }

  const alignedState = shouldAlignUseStateWithRelaxedMock(normalizeRelPath(relPath))
    ? alignUseStateWithRelaxedMock(next)
    : null;
  if (alignedState) {
    next = alignedState;
    fixes.push("aligned useState with relaxed mock array");
  }

  const statusField = repairMisplacedStatusInDateField(next);
  if (statusField) {
    next = statusField;
    fixes.push("fixed misplaced status in date field");
  }

  const scalarArrays = wrapAllScalarArrayProperties(next);
  if (scalarArrays) {
    next = scalarArrays;
    fixes.push("wrapped scalar mock fields as arrays");
  }

  const docUrls = completeMockDocumentUrls(next);
  if (docUrls) {
    next = docUrls;
    fixes.push("completed mock document urls");
  }

  const scheduleTimes = completeMockScheduleItemTimes(next);
  if (scheduleTimes) {
    next = scheduleTimes;
    fixes.push("completed mock schedule item times");
  }

  const docTypes = mapInvalidDocumentTypeLiterals(next);
  if (docTypes) {
    next = docTypes;
    fixes.push("mapped invalid document type literals");
  }

  const statusFallbacks = addStatusFallbackForBadgeProps(next);
  if (statusFallbacks) {
    next = statusFallbacks;
    fixes.push("added status prop fallbacks");
  }

  const collapsedUrl = collapseRepeatedPropertyLines(next, "url");
  if (collapsedUrl) {
    next = collapsedUrl;
    fixes.push("collapsed duplicate url properties");
  }

  const docMock = repairBrokenDocumentMockArray(next);
  if (docMock) {
    next = docMock;
    fixes.push("repaired broken document mock array");
  }

  const syncResult = applyQuickRepairsForFileSync(relPath, next, diagnostics);
  if (syncResult) {
    next = syncResult.content;
    fixes.push(...syncResult.fixes);
  }

  if (readFile) {
    const normalized = normalizeRelPath(relPath);
    for (let round = 0; round < 6; round++) {
      let roundChanged = false;
      const missingDiags = diagnostics
        .filter(
          (d) =>
            normalizeRelPath(d.file) === normalized &&
            (d.code === "TS2739" ||
              d.code === "TS2741" ||
              (d.code === "TS2322" && parseMissingPropertyError(d.code, d.message))),
        )
        .sort((a, b) => b.line - a.line);

      for (const diagnostic of missingDiags) {
        const result = await applyMissingPropertyFix(relPath, next, diagnostic, readFile);
        if (!result) continue;
        next = result.content;
        fixes.push(result.label);
        roundChanged = true;
      }
      if (!roundChanged) break;
    }

    const completionDiags = diagnostics.filter(
      (d) => d.code === "TS2322" && normalizeRelPath(d.file) === normalized,
    );
    for (const diagnostic of completionDiags) {
      const completed = await completeObjectLiteralForType(relPath, next, diagnostic, readFile);
      if (!completed) continue;
      next = completed.content;
      fixes.push(completed.label);
    }

    const unionValueDiags = diagnostics.filter(
      (d) =>
        (d.code === "TS2322" || d.code === "TS2820" || d.code === "TS2678") &&
        normalizeRelPath(d.file) === normalized,
    );
    for (const diagnostic of unionValueDiags) {
      const unionValueFix = await applyUnionLiteralValueFix(next, diagnostic, readFile);
      if (!unionValueFix) continue;
      if (unionValueFix.typesContent) {
        extraFiles["src/types.ts"] = unionValueFix.typesContent;
      }
      next = unionValueFix.content;
      fixes.push(unionValueFix.label);
    }

    const exportDiags = diagnostics.filter(
      (d) =>
        (d.code === "TS2614" || d.code === "TS2613") &&
        normalizeRelPath(d.file) === normalized,
    );
    for (const diagnostic of exportDiags) {
      const result = await applyExportImportFix(relPath, next, diagnostic, readFile);
      if (!result) continue;
      if (result.exporterPath && result.exporterContent) {
        extraFiles[result.exporterPath] = result.exporterContent;
      }
      if (result.content !== next) {
        next = result.content;
      }
      fixes.push(result.label);
    }

    const shapeDiags = diagnostics.filter(
      (d) =>
        (d.code === "TS2353" ||
          d.code === "TS2322" ||
          d.code === "TS2678") &&
        normalizeRelPath(d.file) === normalized,
    );
    for (const diagnostic of shapeDiags) {
      if (diagnostic.code === "TS2353") {
        const parsed = parseTs2353Error(diagnostic.message);
        if (parsed?.typeName.startsWith("Record<")) {
          const relaxed = relaxExhaustiveRecordAnnotation(next);
          if (relaxed) {
            next = relaxed;
            fixes.push("relaxed exhaustive Record annotation");
            continue;
          }
          const recordFix = applyRecordLiteralKeyFix(
            next,
            diagnostic,
            parsed.property,
            parsed.typeName,
          );
          if (recordFix) {
            next = recordFix.content;
            fixes.push(recordFix.label);
            continue;
          }
        }
        const augmented = await applyTs2353LiteralPropertyFix(next, diagnostic, readFile);
        if (augmented) {
          next = augmented.content;
          fixes.push(augmented.label);
          continue;
        }
        const typeAugmented = await applyTs2353TypeAugmentation(diagnostic, readFile);
        if (!typeAugmented) continue;
        extraFiles[typeAugmented.path] = typeAugmented.content;
        fixes.push(typeAugmented.label);
        continue;
      }
      if (
        diagnostic.code === "TS2322" &&
        /Type 'string' is not assignable to type 'number'/.test(diagnostic.message)
      ) {
        const restored = fixStringToNumberLiteral(next, diagnostic);
        if (restored) {
          next = restored;
          fixes.push("restored quoted number literal");
          continue;
        }
      }
      if (
        diagnostic.code === "TS2322" &&
        /Type 'number' is not assignable to type 'string'/.test(diagnostic.message)
      ) {
        const typeFix = await fixPrimitiveTypeMismatchInTypes(diagnostic, readFile);
        if (typeFix) {
          extraFiles["src/types.ts"] = typeFix.content;
          fixes.push(typeFix.label);
          continue;
        }
        const coerced = fixNumberToStringLiteral(next, diagnostic);
        if (coerced) {
          next = coerced;
          fixes.push("coerced number literal to string");
          continue;
        }
      }
      const unionFix = await applyUnionLiteralAugmentation(diagnostic, readFile);
      if (!unionFix) continue;
      extraFiles[unionFix.path] = unionFix.content;
      fixes.push(unionFix.label);
    }
  }

  if (fixes.length === 0 || next === content) {
    if (Object.keys(extraFiles).length === 0) return null;
    return { content: next, fixes, extraFiles };
  }
  return {
    content: next,
    fixes,
    ...(Object.keys(extraFiles).length > 0 ? { extraFiles } : {}),
  };
}

export function groupQuickRepairTargets(
  diagnostics: readonly TypeScriptDiagnostic[],
): Map<string, TypeScriptDiagnostic[]> {
  const map = new Map<string, TypeScriptDiagnostic[]>();
  for (const d of diagnostics) {
    if (!isQuickRepairableDiagnostic(d)) continue;
    const rel = normalizeRelPath(d.file);
    const list = map.get(rel) ?? [];
    list.push(d);
    map.set(rel, list);
  }
  return map;
}
