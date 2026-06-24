import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { ReadProjectFile } from "@/core/typescript/missingPropertyRepair";
import { applyUnionLiteralAugmentation } from "@/core/typescript/typeShapeRepair";

const UNION_ASSIGN_RE = /Type '([^']+)' is not assignable to type '([^']+)'/;
const DID_YOU_MEAN_RE = /Did you mean '([^']+)'\?/;

export function parseUnionAssignabilityError(
  message: string,
): { literal: string; typeExpr: string } | null {
  const match = message.match(UNION_ASSIGN_RE);
  if (!match?.[1] || !match[2]) return null;
  if (!match[2].includes("|")) return null;
  return { literal: match[1], typeExpr: match[2] };
}

export function extractUnionLiterals(typeExpr: string): string[] {
  return [...typeExpr.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

export function closestUnionLiteral(value: string, allowed: readonly string[]): string | null {
  const unquoted = value.replace(/^['"]|['"]$/g, "");
  if (allowed.includes(unquoted)) return unquoted;
  const normalized = unquoted.toLowerCase().replace(/[\s-]+/g, "_");
  for (const candidate of allowed) {
    const candNorm = candidate.toLowerCase().replace(/[\s-]+/g, "_");
    if (candNorm === normalized) return candidate;
  }
  const semanticAliases: Record<string, string[]> = {
    form: ["handbook", "policy", "contract", "review"],
    planned: ["scheduled", "draft", "pending", "open"],
    delayed: ["postponed", "pending", "overdue"],
    in_progress: ["active", "pending", "open"],
  };
  const aliasTargets = semanticAliases[normalized];
  if (aliasTargets) {
    for (const target of aliasTargets) {
      const hit = allowed.find(
        (c) => c.toLowerCase().replace(/[\s-]+/g, "_") === target,
      );
      if (hit) return hit;
    }
  }
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of allowed) {
    const score = levenshtein(normalized, candidate.toLowerCase().replace(/[\s-]+/g, "_"));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export function replaceLiteralOnLine(
  line: string,
  wrong: string,
  replacement: string,
): string | null {
  const quotedWrong = wrong.replace(/^['"]|['"]$/g, "");
  const patterns = [
    new RegExp(`(['"])${quotedWrong}\\1`),
    new RegExp(`\\b${quotedWrong}\\b`),
  ];
  for (const re of patterns) {
    if (re.test(line)) {
      return line.replace(re, `"${replacement}"`);
    }
  }
  return null;
}

export async function applyUnionLiteralValueFix(
  content: string,
  diagnostic: TypeScriptDiagnostic,
  readFile: ReadProjectFile,
): Promise<{ content: string; label: string; typesContent?: string } | null> {
  const didYouMean = diagnostic.message.match(DID_YOU_MEAN_RE);
  if (didYouMean?.[1] && (diagnostic.code === "TS2820" || diagnostic.code === "TS2322")) {
    const wrongMatch = diagnostic.message.match(/Type '([^']+)'/);
    const lines = content.split("\n");
    const idx = diagnostic.line - 1;
    if (idx < 0 || idx >= lines.length) return null;
    const fixed = wrongMatch?.[1]
      ? replaceLiteralOnLine(lines[idx]!, wrongMatch[1], didYouMean[1])
      : null;
    if (fixed) {
      lines[idx] = fixed;
      return { content: lines.join("\n"), label: `mapped literal to ${didYouMean[1]}` };
    }
  }

  const parsed = parseUnionAssignabilityError(diagnostic.message);
  if (!parsed) return null;
  const allowed = extractUnionLiterals(parsed.typeExpr);
  if (allowed.length === 0) return null;

  const closest = closestUnionLiteral(parsed.literal, allowed);
  if (!closest) return null;

  const lines = content.split("\n");
  const idx = diagnostic.line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const fixed = replaceLiteralOnLine(lines[idx]!, parsed.literal, closest);
  if (!fixed) {
    const augmented = await applyUnionLiteralAugmentation(diagnostic, readFile);
    if (!augmented) return null;
    return {
      content,
      label: augmented.label,
      typesContent: augmented.content,
    };
  }

  if (fixed === lines[idx]) return null;
  lines[idx] = fixed;
  return { content: lines.join("\n"), label: `mapped ${parsed.literal} to ${closest}` };
}
