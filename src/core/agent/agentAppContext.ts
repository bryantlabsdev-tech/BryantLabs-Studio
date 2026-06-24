import { displayNameFromPrompt } from "@/core/domain";
import type { ProjectEditAuditResult } from "@/core/agent/projectEditAudit";
import type { ProjectFact } from "@/core/build/projectFacts";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { ProjectScan } from "@/types";

export interface CurrentAppContext {
  readonly appName: string;
  readonly stack: string;
  readonly features: readonly string[];
  readonly summaryLine: string;
  readonly updatedAt: number;
}

const FEATURE_LABEL_OVERRIDES: Record<string, string> = {
  "Puzzle board": "Puzzle board",
  "Product comparison": "Product comparison",
  "Search and filters": "Filters",
  "Timer": "Timer",
  "Difficulty selector": "Difficulty levels",
  "Hint system": "Hints",
  "Theme support": "Theming",
  "Mobile layout": "Mobile layout",
  "Dashboard UI": "Dashboard",
  "LocalStorage enabled": "Saved progress",
  Statistics: "Statistics",
  "User accounts": "User accounts",
};

function titleCase(value: string): string {
  if (!value.trim()) return "App";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function inferAppName(input: {
  sessionMemory: SessionMemorySnapshot;
  chat: readonly FollowUpChatMessage[];
  projectMemory: ProjectMemory;
  projectName?: string | null;
}): string {
  if (input.projectMemory.projectName.trim()) {
    return titleCase(input.projectMemory.projectName.trim());
  }

  const corpus = [
    ...input.sessionMemory.prompts.map((p) => p.prompt),
    ...input.chat.filter((m) => m.role === "user").map((m) => m.text),
  ];

  for (const text of corpus) {
    const name = displayNameFromPrompt(text);
    if (name !== "App") return name;
  }

  if (input.projectName?.trim()) {
    const cleaned = input.projectName.trim().replace(/[-_]/g, " ");
    if (cleaned.length >= 2) return titleCase(cleaned);
  }

  return "App";
}

function inferStack(
  audit: ProjectEditAuditResult | null,
  scan: ProjectScan | null,
): string {
  if (audit) {
    const framework = audit.framework?.trim() || "React";
    return audit.typescript ? `${framework} + TypeScript` : framework;
  }
  if (scan?.summary.framework) {
    const framework = scan.summary.framework;
    return scan.summary.detections.tsconfig
      ? `${framework} + TypeScript`
      : framework;
  }
  return "React + TypeScript";
}

function friendlyFeatureLabel(label: string): string {
  return FEATURE_LABEL_OVERRIDES[label] ?? label.replace(/ exists$/i, "");
}

function deriveFeatures(
  projectFacts: readonly ProjectFact[],
  audit: ProjectEditAuditResult | null,
  sessionMemory: SessionMemorySnapshot,
): string[] {
  const features = new Set<string>();

  for (const fact of projectFacts) {
    if (fact.present) features.add(friendlyFeatureLabel(fact.label));
  }

  for (const hint of audit?.featureHints ?? []) {
    const cleaned = hint
      .replace(/^component:/i, "")
      .replace(/^hook:/i, "")
      .replace(/^function:/i, "")
      .trim();
    if (cleaned.length >= 2) features.add(titleCase(cleaned));
  }

  for (const plan of sessionMemory.plans) {
    const summary = plan.summary.trim();
    if (summary.length >= 4 && summary.length <= 48) features.add(summary);
  }

  return [...features].slice(0, 8);
}

export function buildCurrentAppContext(input: {
  scan: ProjectScan | null;
  audit: ProjectEditAuditResult | null;
  sessionMemory: SessionMemorySnapshot;
  chat: readonly FollowUpChatMessage[];
  projectMemory: ProjectMemory;
  projectFacts: readonly ProjectFact[];
  projectName?: string | null;
}): CurrentAppContext | null {
  const hasSignals =
    Boolean(input.scan) ||
    input.sessionMemory.prompts.length > 0 ||
    input.chat.length > 0;

  if (!hasSignals) return null;

  const appName = inferAppName(input);
  const stack = inferStack(input.audit, input.scan);
  const features = deriveFeatures(
    input.projectFacts,
    input.audit,
    input.sessionMemory,
  );

  const featurePart =
    features.length > 0 ? ` · ${features.slice(0, 3).join(", ")}` : "";

  return {
    appName,
    stack,
    features,
    summaryLine: `${appName} · ${stack}${featurePart}`,
    updatedAt: Date.now(),
  };
}

export function appContextMemoryPatch(
  ctx: CurrentAppContext,
): Pick<ProjectMemory, "projectName" | "architecture" | "notes"> {
  const featureLines =
    ctx.features.length > 0
      ? ctx.features.map((f) => `- ${f}`).join("\n")
      : "- Core app structure";

  return {
    projectName: ctx.appName,
    architecture: ctx.stack,
    notes: `Features:\n${featureLines}`,
  };
}

export function hasEstablishedAppContext(
  ctx: CurrentAppContext | null | undefined,
  sessionMemory: SessionMemorySnapshot,
): boolean {
  if (ctx && ctx.appName !== "App") return true;
  return sessionMemory.prompts.length > 0;
}
