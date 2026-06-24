import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";
import {
  detectActivityFeedEvidence,
  detectCrudButtonEvidence,
  detectDarkDashboardEvidence,
  detectLocalStorageEvidence,
  detectLucideEvidence,
  detectReactRouterEvidence,
  detectResponsiveLayoutEvidence,
  detectRoutingWorksEvidence,
  detectTablesWithMockDataEvidence,
  detectTailwindEvidence,
} from "@/core/agent/requirementEvidenceHeuristics";
import {
  extractPromptRequirements,
  isHardRequirement,
  requirementTypeLabel,
  type ExtractedRequirement,
  type RequirementType,
} from "@/core/agent/requirementExtraction";
import type { GeneratedFile } from "@/core/greenfield/types";
import type { ProjectScan } from "@/types";

export type RequirementImplementationStatus = "pass" | "fail" | "unknown";

export { requirementTypeLabel };
export type { RequirementType };

export interface RequirementEvidenceRef {
  readonly file: string;
  readonly line?: number;
  readonly snippet?: string;
}

export interface RequirementChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly type: RequirementType;
  readonly advisory: boolean;
  /** Requirement was extracted from the user prompt. */
  readonly detected: boolean;
  readonly status: RequirementImplementationStatus;
  /** @deprecated Use status === "pass" — kept for existing callers. */
  readonly satisfied: boolean;
  readonly evidence: string | null;
  readonly evidenceRefs: readonly RequirementEvidenceRef[];
  readonly reason: string | null;
}

export interface RequirementEvidence {
  readonly prompt: string;
  readonly fileDiffs: readonly RunFileDiff[];
  readonly generatedFiles?: readonly GeneratedFile[] | null;
  readonly scan?: ProjectScan | null;
  readonly buildPassed?: boolean;
}

export interface RequirementVerificationResult {
  readonly items: readonly RequirementChecklistItem[];
  readonly allSatisfied: boolean;
  readonly implementationFileCount: number;
}

export interface RequirementRepairSuggestion {
  readonly missingRequirements: readonly string[];
  readonly likelyReason: string;
  readonly suggestedPrompt: string;
}

interface ImplementationSource {
  readonly path: string;
  readonly content: string;
}

function implementationSources(evidence: RequirementEvidence): ImplementationSource[] {
  const sources: ImplementationSource[] = [];
  for (const diff of evidence.fileDiffs) {
    const content = diff.after?.trim();
    if (content) sources.push({ path: diff.path, content });
  }
  for (const file of evidence.generatedFiles ?? []) {
    if (file.content.trim()) sources.push({ path: file.path, content: file.content });
  }
  return sources;
}

function hasContentMatching(content: string, pattern: RegExp): boolean {
  return pattern.test(content);
}

function formatEvidenceRefs(refs: readonly RequirementEvidenceRef[]): string | null {
  if (refs.length === 0) return null;
  return refs
    .map((ref) =>
      ref.line != null ? `${ref.file} line ${ref.line}` : ref.file,
    )
    .join("; ");
}

function findContentMatch(
  sources: readonly ImplementationSource[],
  pattern: RegExp,
): RequirementEvidenceRef | null {
  for (const source of sources) {
    const lines = source.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (pattern.test(line)) {
        return {
          file: source.path,
          line: index + 1,
          snippet: line.trim().slice(0, 120),
        };
      }
    }
    if (pattern.test(source.content)) {
      return { file: source.path, line: 1 };
    }
  }
  return null;
}

function findPathMatch(
  sources: readonly ImplementationSource[],
  pattern: RegExp,
): RequirementEvidenceRef | null {
  const match = sources.find((source) => pattern.test(source.path));
  return match ? { file: match.path } : null;
}

function makeItem(
  id: string,
  label: string,
  type: RequirementType,
  advisory: boolean,
  status: RequirementImplementationStatus,
  evidenceRefs: readonly RequirementEvidenceRef[],
  reason: string | null,
): RequirementChecklistItem {
  return {
    id,
    label,
    type,
    advisory,
    detected: true,
    status,
    satisfied: status === "pass",
    evidence: formatEvidenceRefs(evidenceRefs),
    evidenceRefs,
    reason,
  };
}

function unknownItems(
  extracted: readonly ExtractedRequirement[],
  reason: string,
): RequirementChecklistItem[] {
  return extracted.map((req) =>
    makeItem(req.id, req.label, req.type, req.advisory, "unknown", [], reason),
  );
}

function isCalculationHistoryPrompt(prompt: string): boolean {
  return /calculation\s+history|history\s+component|last\s+10\s+calculations?/i.test(
    prompt,
  );
}

function evaluateCalculationHistoryRequirements(
  evidence: RequirementEvidence,
  sources: readonly ImplementationSource[],
): RequirementChecklistItem[] {
  const content = sources.map((s) => `${s.path}\n${s.content}`).join("\n");

  const historyPathRef = findPathMatch(sources, /History\.(tsx|jsx|ts|js)$/i) ??
    findPathMatch(sources, /components\/History\.(tsx|jsx)$/i);
  const historyContentRef = findContentMatch(
    sources,
    /(?:function|const|class)\s+History\b|export\s+(?:default\s+)?function\s+History\b/,
  );
  const historyComponentCreated = Boolean(historyPathRef ?? historyContentRef);

  const lastTenRef = findContentMatch(
    sources,
    /(?:slice\s*\(\s*-?\s*10\s*\)|\.slice\s*\(\s*0\s*,\s*10\s*\)|MAX_HISTORY\s*=\s*10|HISTORY_LIMIT\s*=\s*10|limit\s*[:=]\s*10)/i,
  );
  const lastTenShown = Boolean(lastTenRef);

  const storageRef = findContentMatch(sources, /localStorage\.(?:getItem|setItem|removeItem)/);
  const localStorageUsed = Boolean(storageRef);

  const clearRef = findContentMatch(
    sources,
    /clear\s+history|Clear\s+History|onClear(?:History)?|clearHistory/i,
  );
  const clearHistoryButton =
    Boolean(clearRef) &&
    hasContentMatching(content, /<button|type\s*=\s*["']button["']/i);

  const calculatorRef = findContentMatch(sources, /(?:function|const|class)\s+Calculator\b/i);
  const calculatorStillWorks =
    Boolean(calculatorRef) &&
    (evidence.buildPassed !== false);

  return [
    makeItem(
      "history-component",
      "History component created",
      "feature",
      false,
      historyComponentCreated ? "pass" : "fail",
      [historyPathRef, historyContentRef].filter(Boolean) as RequirementEvidenceRef[],
      historyComponentCreated
        ? null
        : "No file matching History.tsx / History.jsx / components/History found.",
    ),
    makeItem(
      "last-ten-calculations",
      "Last 10 calculations shown",
      "feature",
      false,
      lastTenShown ? "pass" : "fail",
      lastTenRef ? [lastTenRef] : [],
      lastTenShown
        ? null
        : "No slice(-10), limit 10, or equivalent max-history logic detected.",
    ),
    makeItem(
      "local-storage",
      "localStorage used",
      "tech",
      false,
      localStorageUsed ? "pass" : "fail",
      storageRef ? [storageRef] : [],
      localStorageUsed
        ? null
        : "No localStorage.getItem/setItem usage found in modified source files.",
    ),
    makeItem(
      "clear-history-button",
      "Clear history button visible",
      "feature",
      false,
      clearHistoryButton ? "pass" : "fail",
      clearRef ? [clearRef] : [],
      clearHistoryButton
        ? null
        : 'No button or text matching "Clear History" found in generated/modified source.',
    ),
    makeItem(
      "calculator-works",
      "Calculator still works",
      "feature",
      false,
      calculatorStillWorks ? "pass" : "fail",
      calculatorRef ? [calculatorRef] : [],
      evidence.buildPassed === false
        ? "Build failed after edits."
        : "Calculator logic missing from generated or modified source files.",
    ),
  ];
}

function keywordHits(
  sources: readonly ImplementationSource[],
  keywords: readonly string[],
): { refs: RequirementEvidenceRef[]; hitCount: number } {
  const refs: RequirementEvidenceRef[] = [];
  const hitFiles = new Set<string>();

  for (const keyword of keywords) {
    const pathRef = findPathMatch(sources, new RegExp(keyword, "i"));
    if (pathRef) {
      refs.push(pathRef);
      hitFiles.add(pathRef.file);
      continue;
    }
    const contentRef = findContentMatch(sources, new RegExp(keyword, "i"));
    if (contentRef) {
      refs.push(contentRef);
      hitFiles.add(contentRef.file);
    }
  }

  return { refs, hitCount: hitFiles.size };
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 3 &&
        !/^(add|show|create|make|with|the|and|for|page|screen|view|card|section|include)$/i.test(
          word,
        ),
    );
}

function evaluatePageRequirement(
  requirement: ExtractedRequirement,
  sources: readonly ImplementationSource[],
): RequirementChecklistItem {
  const pageMatch = requirement.label.match(/\b([A-Za-z][A-Za-z0-9]*)\s+page\b/i);
  const pageName =
    pageMatch?.[1] ??
    requirement.label.match(/^([A-Za-z][A-Za-z0-9]*)\b/)?.[1] ??
    requirement.label.split(/\s+/)[0] ??
    requirement.label;
  const namePattern = new RegExp(
    `(?:pages\\/|components\\/)?${pageName}\\.(tsx|jsx)|Route.*${pageName}|nav.*${pageName}|to=["']\\/${pageName.toLowerCase()}`,
    "i",
  );
  const pathRef = findPathMatch(sources, new RegExp(`${pageName}\\.(tsx|jsx|ts|js)$`, "i"));
  const contentRef = findContentMatch(sources, namePattern);
  const refs = [pathRef, contentRef].filter(Boolean) as RequirementEvidenceRef[];
  const passed = refs.length > 0;

  return makeItem(
    requirement.id,
    requirement.label,
    requirement.type,
    requirement.advisory,
    passed ? "pass" : "fail",
    refs,
    passed
      ? null
      : `No route, nav, or ${pageName} component found in generated/modified files.`,
  );
}

function evaluateTechRequirement(
  requirement: ExtractedRequirement,
  sources: readonly ImplementationSource[],
): RequirementChecklistItem {
  const label = requirement.label.toLowerCase();
  let detection: { passed: boolean; refs: RequirementEvidenceRef[] } | null = null;

  if (/react\s+router|react-router/.test(label)) {
    detection = detectReactRouterEvidence(sources);
  } else if (/tailwind/.test(label)) {
    detection = detectTailwindEvidence(sources);
  } else if (/lucide/.test(label)) {
    detection = detectLucideEvidence(sources);
  } else if (/localstorage|persist|storage/.test(label)) {
    detection = detectLocalStorageEvidence(sources);
  } else if (/typescript/.test(label)) {
    const pkg = sources.find((s) => s.path.endsWith("package.json"));
    const ref = pkg && /"typescript"/.test(pkg.content) ? { file: pkg.path } : null;
    detection = { passed: Boolean(ref), refs: ref ? [ref] : [] };
  } else if (/vite/.test(label)) {
    const pkg = sources.find((s) => s.path.endsWith("package.json"));
    const ref = pkg && /"vite"/.test(pkg.content) ? { file: pkg.path } : null;
    detection = { passed: Boolean(ref), refs: ref ? [ref] : [] };
  }

  if (!detection) {
    const keywords = extractKeywords(requirement.label);
    const { refs, hitCount } = keywordHits(sources, keywords);
    detection = {
      passed: keywords.length > 0 && hitCount > 0,
      refs,
    };
  }

  return makeItem(
    requirement.id,
    requirement.label,
    requirement.type,
    requirement.advisory,
    detection.passed ? "pass" : "fail",
    detection.refs,
    detection.passed
      ? null
      : "No package, import, utility-class, or config evidence for this tech requirement.",
  );
}

function evaluateStatusEnumRequirement(
  requirement: ExtractedRequirement,
  sources: readonly ImplementationSource[],
): RequirementChecklistItem {
  const values = requirement.values ?? parseCommaListFromLabel(requirement.label);
  const searchTerms = values.map((v) => v.replace(/\s+/g, "[\\s_-]*"));

  const refs: RequirementEvidenceRef[] = [];
  for (const term of searchTerms) {
    const contentRef = findContentMatch(sources, new RegExp(term, "i"));
    if (contentRef) refs.push(contentRef);
  }

  const matchedValues = values.filter((value) => {
    const pattern = new RegExp(value.replace(/\s+/g, "[\\s_-]*"), "i");
    return sources.some((s) => pattern.test(s.content));
  });

  const passed =
    values.length > 0 &&
    matchedValues.length >= Math.ceil(values.length / 2);

  return makeItem(
    requirement.id,
    requirement.label,
    requirement.type,
    requirement.advisory,
    passed ? "pass" : "fail",
    refs,
    passed
      ? null
      : `Missing status values: ${values
          .filter((v) => !matchedValues.includes(v))
          .join(", ")}`,
  );
}

function parseCommaListFromLabel(label: string): string[] {
  const includeMatch = label.match(/\binclude\s+(.+)$/i);
  if (!includeMatch) return extractKeywords(label);
  return includeMatch[1]!
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function evaluateSemanticFeature(
  requirement: ExtractedRequirement,
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: RequirementEvidenceRef[] } | null {
  const label = requirement.label.toLowerCase();
  if (/recent\s+activity|activity\s+feed/.test(label)) {
    return detectActivityFeedEvidence(sources);
  }
  if (/tables?\s+with\s+mock|mock\s+data/.test(label)) {
    return detectTablesWithMockDataEvidence(sources);
  }
  return null;
}

function evaluateFeatureRequirement(
  requirement: ExtractedRequirement,
  sources: readonly ImplementationSource[],
): RequirementChecklistItem {
  const semantic = evaluateSemanticFeature(requirement, sources);
  if (semantic) {
    return makeItem(
      requirement.id,
      requirement.label,
      requirement.type,
      requirement.advisory,
      semantic.passed ? "pass" : "fail",
      semantic.refs,
      semantic.passed
        ? null
        : "No matching UI structure found for this feature requirement.",
    );
  }

  if (requirement.values && requirement.values.length > 0) {
    const matched = requirement.values.filter((value) => {
      const pattern = new RegExp(value.replace(/\s+/g, "[\\s_-]*"), "i");
      return (
        sources.some((s) => pattern.test(s.content)) ||
        sources.some((s) => pattern.test(s.path))
      );
    });
    const refs: RequirementEvidenceRef[] = [];
    for (const value of matched) {
      const ref =
        findPathMatch(sources, new RegExp(value.replace(/\s+/g, ""), "i")) ??
        findContentMatch(sources, new RegExp(value.replace(/\s+/g, "[\\s_-]*"), "i"));
      if (ref) refs.push(ref);
    }
    const passed =
      requirement.values.length > 0 &&
      matched.length >= Math.ceil(requirement.values.length / 2);
    return makeItem(
      requirement.id,
      requirement.label,
      requirement.type,
      requirement.advisory,
      passed ? "pass" : "fail",
      refs,
      passed
        ? null
        : `Missing KPI evidence for: ${requirement.values
            .filter((v) => !matched.includes(v))
            .join(", ")}`,
    );
  }

  const keywords = extractKeywords(requirement.label);
  const { refs, hitCount } = keywordHits(sources, keywords);
  const passed = keywords.length > 0 && hitCount >= Math.ceil(keywords.length / 2);

  return makeItem(
    requirement.id,
    requirement.label,
    requirement.type,
    requirement.advisory,
    passed ? "pass" : "fail",
    refs,
    passed
      ? null
      : `Missing implementation for: ${keywords
          .filter(
            (word) =>
              !refs.some(
                (ref) =>
                  ref.file.toLowerCase().includes(word) ||
                  ref.snippet?.toLowerCase().includes(word),
              ),
          )
          .join(", ")}`,
  );
}

function evaluateQualityRequirement(
  requirement: ExtractedRequirement,
  sources: readonly ImplementationSource[],
): RequirementChecklistItem {
  const label = requirement.label.toLowerCase();
  let inferred: { passed: boolean; refs: RequirementEvidenceRef[] } | null = null;

  if (/modern.*dashboard|dark.*dashboard|saas/.test(label)) {
    inferred = detectDarkDashboardEvidence(sources);
  } else if (/responsive|mobile/.test(label)) {
    inferred = detectResponsiveLayoutEvidence(sources);
  } else if (/clean\s+reusable|visual\s+polish/.test(label)) {
    const uiRef = findContentMatch(sources, /export\s+default\s+function|<(?:section|main|div)/);
    inferred = { passed: Boolean(uiRef), refs: uiRef ? [uiRef] : [] };
  }

  if (requirement.advisory) {
    if (inferred?.passed) {
      return makeItem(
        requirement.id,
        requirement.label,
        requirement.type,
        true,
        "pass",
        inferred.refs,
        "Advisory quality goal — inferred from generated UI.",
      );
    }
    return makeItem(
      requirement.id,
      requirement.label,
      requirement.type,
      true,
      "unknown",
      [],
      "Advisory quality goal — not scored for completion.",
    );
  }

  const keywords = extractKeywords(requirement.label);
  const { refs, hitCount } = keywordHits(sources, keywords);
  const passed = keywords.length > 0 && hitCount >= Math.ceil(keywords.length / 2);
  return makeItem(
    requirement.id,
    requirement.label,
    requirement.type,
    false,
    passed ? "pass" : "fail",
    refs,
    passed ? null : "Measurable quality criteria not met in generated source.",
  );
}

function evaluateAuditTaskRequirement(
  requirement: ExtractedRequirement,
  evidence: RequirementEvidence,
  sources: readonly ImplementationSource[],
  implementationFileCount: number,
): RequirementChecklistItem {
  const buildOk = evidence.buildPassed !== false;
  const hasOutput = implementationFileCount > 0;
  const label = requirement.label.toLowerCase();

  let inferred: { passed: boolean; refs: RequirementEvidenceRef[] } | null = null;
  if (/check\s+routing/.test(label)) {
    inferred = detectRoutingWorksEvidence(sources);
  } else if (/check\s+crud/.test(label)) {
    inferred = detectCrudButtonEvidence(sources);
  } else if (/return\s+summary|known\s+limitations|files?\s+changed/.test(label)) {
    inferred = { passed: buildOk && hasOutput, refs: [] };
  }

  const passed = inferred
    ? inferred.passed && buildOk
    : buildOk && hasOutput;

  return makeItem(
    requirement.id,
    requirement.label,
    requirement.type,
    true,
    passed ? "pass" : "unknown",
    inferred?.refs ?? [],
    passed
      ? "Advisory audit task — verified from run output and generated files."
      : "Advisory audit task — verify run output manually.",
  );
}

function evaluateDataModelRequirement(
  requirement: ExtractedRequirement,
  sources: readonly ImplementationSource[],
): RequirementChecklistItem {
  const keywords = extractKeywords(requirement.label);
  const typeRef = findContentMatch(
    sources,
    /(?:interface|type|enum)\s+\w+/,
  );
  const { refs, hitCount } = keywordHits(sources, keywords);
  const allRefs = [...refs, ...(typeRef ? [typeRef] : [])];
  const passed = hitCount >= Math.ceil(Math.max(keywords.length, 1) / 2);

  return makeItem(
    requirement.id,
    requirement.label,
    requirement.type,
    requirement.advisory,
    passed ? "pass" : "fail",
    allRefs,
    passed ? null : "No data model types or entities found in generated source.",
  );
}

function evaluateExtractedRequirement(
  requirement: ExtractedRequirement,
  evidence: RequirementEvidence,
  sources: readonly ImplementationSource[],
  implementationFileCount: number,
): RequirementChecklistItem {
  switch (requirement.type) {
    case "page":
      return evaluatePageRequirement(requirement, sources);
    case "tech":
      return evaluateTechRequirement(requirement, sources);
    case "status_enum":
      return evaluateStatusEnumRequirement(requirement, sources);
    case "quality":
      return evaluateQualityRequirement(requirement, sources);
    case "audit_task":
      return evaluateAuditTaskRequirement(
        requirement,
        evidence,
        sources,
        implementationFileCount,
      );
    case "data_model":
      return evaluateDataModelRequirement(requirement, sources);
    case "feature":
    default:
      return evaluateFeatureRequirement(requirement, sources);
  }
}

function hardRequirementsSatisfied(items: readonly RequirementChecklistItem[]): boolean {
  const hard = items.filter((item) => isHardRequirement(item));
  if (hard.length === 0) return items.every((item) => item.status === "pass");
  return hard.every((item) => item.status === "pass");
}

export function buildRequirementChecklist(
  prompt: string,
): readonly { id: string; label: string; type: RequirementType; advisory: boolean }[] {
  if (isCalculationHistoryPrompt(prompt)) {
    return evaluateCalculationHistoryRequirements({ prompt, fileDiffs: [] }, []).map(
      ({ id, label, type, advisory }) => ({ id, label, type, advisory }),
    );
  }

  const extracted = extractPromptRequirements(prompt);
  if (extracted.length === 0) {
    return [{ id: "prompt-goal", label: prompt.trim(), type: "feature", advisory: false }];
  }
  return extracted.map(({ id, label, type, advisory }) => ({
    id,
    label,
    type,
    advisory,
  }));
}

export function evaluateRequirementChecklist(
  evidence: RequirementEvidence,
): RequirementVerificationResult {
  const sources = implementationSources(evidence);
  const implementationFileCount = sources.length;
  const extracted = isCalculationHistoryPrompt(evidence.prompt)
    ? null
    : extractPromptRequirements(evidence.prompt);

  if (implementationFileCount === 0) {
    if (isCalculationHistoryPrompt(evidence.prompt)) {
      const items = evaluateCalculationHistoryRequirements(evidence, []).map((item) =>
        makeItem(
          item.id,
          item.label,
          item.type,
          item.advisory,
          "unknown",
          [],
          "No generated or modified files available — implementation cannot be verified.",
        ),
      );
      return { items, allSatisfied: false, implementationFileCount };
    }

    const requirementsForUnknown =
      extracted && extracted.length > 0
        ? extracted
        : buildRequirementChecklist(evidence.prompt).map((item) => ({
            id: item.id,
            label: item.label,
            type: item.type,
            advisory: item.advisory,
          }));

    const items = unknownItems(
      requirementsForUnknown,
      "No generated or modified files available — implementation cannot be verified.",
    );
    return { items, allSatisfied: false, implementationFileCount };
  }

  const items = isCalculationHistoryPrompt(evidence.prompt)
    ? evaluateCalculationHistoryRequirements(evidence, sources)
    : (extracted ?? []).map((requirement) =>
        evaluateExtractedRequirement(
          requirement,
          evidence,
          sources,
          implementationFileCount,
        ),
      );

  if (items.length === 0) {
    const fallback = makeItem(
      "prompt-goal",
      evidence.prompt.trim(),
      "feature",
      false,
      "unknown",
      [],
      "No structured requirements extracted from prompt.",
    );
    return {
      items: [fallback],
      allSatisfied: false,
      implementationFileCount,
    };
  }

  return {
    items,
    allSatisfied: hardRequirementsSatisfied(items),
    implementationFileCount,
  };
}

export function buildIncompleteRepairSuggestion(
  prompt: string,
  items: readonly RequirementChecklistItem[],
): RequirementRepairSuggestion | null {
  const missing = items.filter(
    (item) => isHardRequirement(item) && item.status !== "pass",
  );
  if (missing.length === 0) return null;

  if (isCalculationHistoryPrompt(prompt)) {
    return {
      missingRequirements: missing.map((item) => item.label),
      likelyReason:
        missing.map((item) => item.reason).filter(Boolean).join(" ") ||
        "One or more history requirements were not implemented in the edited files.",
      suggestedPrompt:
        "Fix incomplete history feature. Create a History component, persist calculations in localStorage, limit history to 10, and add a visible Clear History button.",
    };
  }

  const labels = missing.map((item) => item.label.toLowerCase());
  return {
    missingRequirements: missing.map((item) => item.label),
    likelyReason:
      missing.map((item) => item.reason).filter(Boolean).join(" ") ||
      "One or more prompt requirements were not implemented.",
    suggestedPrompt: `Fix incomplete feature. ${labels.join(". ")}.`,
  };
}

export function applyRequirementOutcome(
  baseOutcome: RunTerminalOutcome,
  verification: RequirementVerificationResult,
): RunTerminalOutcome {
  if (baseOutcome !== "success") return baseOutcome;
  if (verification.items.length === 0) return baseOutcome;
  if (verification.implementationFileCount === 0) return "incomplete";
  return verification.allSatisfied ? "success" : "incomplete";
}

export function requirementStatusLabel(
  status: RequirementImplementationStatus,
  advisory?: boolean,
): string {
  if (advisory && status === "unknown") return "ADVISORY";
  if (advisory && status === "fail") return "ADVISORY";
  switch (status) {
    case "pass":
      return advisory ? "PASS (advisory)" : "PASS";
    case "fail":
      return "FAIL";
    default:
      return advisory ? "ADVISORY" : "UNKNOWN";
  }
}
