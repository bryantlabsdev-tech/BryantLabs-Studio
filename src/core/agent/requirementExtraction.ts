export type RequirementType =
  | "feature"
  | "page"
  | "tech"
  | "data_model"
  | "status_enum"
  | "quality"
  | "audit_task";

export interface ExtractedRequirement {
  readonly id: string;
  readonly label: string;
  readonly type: RequirementType;
  readonly advisory: boolean;
  /** Grouped enum/KPI values extracted from colon lists. */
  readonly values?: readonly string[];
  /** Parent heading for grouped bullets (e.g. "Pages"). */
  readonly parent?: string;
}

const SECTION_LABEL_RE =
  /^(also\s+include|requirements?|features?|pages?|screens?|views?|tech(\s+stack)?|stack|notes?|overview|summary|deliverables?|scope|goals?)$/i;

const STATUS_PARENT_RE =
  /^(?:\w+\s+)*status(?:es)?$/i;

const KPI_PARENT_RE =
  /^(?:dashboard\s+)?kpis?$/i;

const QUALITY_RE =
  /\b(visual\s+polish|clean\s+reusable\s+components?|polished?\s+ui|beautiful\s+ui|modern\s+(?:dark\s+)?(?:saas\s+)?dashboard|modern\s+design|professional\s+look|pixel[\s-]perfect|ux\s+polish|mobile\s+responsive(?:\s+layout)?|responsive\s+layout|dark\s+(?:theme|mode|ui)|saas\s+dashboard)\b/i;

const MEASURABLE_QUALITY_RE =
  /\b(at\s+\d+\s*px|breakpoint|lighthouse|wcag|accessibility\s+score|contrast\s+ratio|\d+%\s+coverage)\b/i;

const AUDIT_RE =
  /\b(self[\s-]audit|audit\s+checklist|verify\s+(?:the\s+)?(?:build|output|result)|run\s+self[\s-]check|check\s+routing\s+works?|check\s+crud(?:\s+buttons?)?|return\s+summary(?:\s+of\s+files?\s+changed)?|known\s+limitations|files?\s+changed\s+and\s+known\s+limitations)\b/i;

const TECH_RE =
  /\b(react\s+router|react-router-dom|localstorage|sessionstorage|typescript|vite|tailwind(?:\s+css)?|lucide(?:\s+react)?|zustand|redux|supabase|firebase|postgres|sqlite|prisma|drizzle)\b/i;

const UI_FEATURE_RE =
  /\b(recent\s+activity(?:\s+feed)?|activity\s+feed|tables?\s+with\s+mock\s+data|mock\s+data\s+tables?)\b/i;

const PAGE_SUFFIX_RE = /\bpage\b/i;

const DATA_MODEL_RE =
  /\b(model|schema|entity|entities|data\s+model)\b/i;

/** Standalone status tokens that must not become their own requirement. */
const STANDALONE_STATUS_TOKENS = new Set([
  "scheduled",
  "in progress",
  "complete",
  "cancelled",
  "canceled",
  "draft",
  "sent",
  "paid",
  "overdue",
  "new",
  "contacted",
  "qualified",
  "lost",
  "open",
  "closed",
  "pending",
  "approved",
  "rejected",
]);

const KPI_METRIC_TOKENS = new Set([
  "monthly revenue",
  "new leads",
  "active jobs",
  "open estimates",
  "unpaid invoices",
]);

function slugId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug ? `req-${slug}` : `req-${index}`;
}

function stripBullet(line: string): string {
  return line.trim().replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim();
}

function isSectionLabel(text: string): boolean {
  const stripped = text.replace(/:$/, "").trim();
  return SECTION_LABEL_RE.test(stripped);
}

function parseCommaList(value: string): string[] {
  return value
    .split(/\s*,\s*(?:and\s+)?/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isStandaloneStatusFragment(text: string): boolean {
  const norm = text.toLowerCase().trim();
  if (STANDALONE_STATUS_TOKENS.has(norm)) return true;
  if (KPI_METRIC_TOKENS.has(norm)) return true;
  return false;
}

function formatStatusEnumLabel(parent: string, values: readonly string[]): string {
  const parentLabel = parent.replace(/:$/, "").trim();
  return `${parentLabel} include ${values.join(", ")}`;
}

function formatKpiLabel(values: readonly string[]): string {
  return `Dashboard shows KPI cards for ${values.join(", ")}`;
}

function classifyType(
  label: string,
  parent: string | undefined,
  values: readonly string[] | undefined,
): RequirementType {
  const lower = label.toLowerCase();
  if (AUDIT_RE.test(lower)) return "audit_task";
  if (QUALITY_RE.test(lower)) return "quality";
  if (UI_FEATURE_RE.test(lower)) return "feature";
  if (values && values.length > 0) {
    if (STATUS_PARENT_RE.test(parent ?? label) || /status/i.test(label)) {
      return "status_enum";
    }
    if (KPI_PARENT_RE.test(parent ?? label) || /kpi/i.test(label)) {
      return "feature";
    }
  }
  if (TECH_RE.test(lower) || parent?.toLowerCase() === "tech") return "tech";
  if (DATA_MODEL_RE.test(lower)) return "data_model";
  if (PAGE_SUFFIX_RE.test(lower) || parent?.toLowerCase() === "pages") return "page";
  if (
    /^(dashboard|customers?|settings?|estimates?|invoices?|jobs?|leads?|reports?)$/i.test(
      stripBullet(label),
    )
  ) {
    return "page";
  }
  return "feature";
}

function isAdvisory(type: RequirementType, label: string): boolean {
  if (type === "audit_task") return true;
  if (type === "quality") {
    return !MEASURABLE_QUALITY_RE.test(label);
  }
  return false;
}

function segmentPrompt(prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/).map(stripBullet).filter(Boolean);
  if (lines.length > 1) return lines;

  return trimmed
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function pushRequirement(
  requirements: ExtractedRequirement[],
  seen: Set<string>,
  candidate: Omit<ExtractedRequirement, "id" | "advisory"> & { advisory?: boolean },
  index: number,
): void {
  const label = candidate.label.trim();
  if (!label || label.length < 3) return;
  if (isSectionLabel(label)) return;
  if (isStandaloneStatusFragment(label)) return;

  const key = `${candidate.type}:${label.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);

  const type = candidate.type;
  const advisory = candidate.advisory ?? isAdvisory(type, label);
  requirements.push({
    id: slugId(label, index),
    label,
    type,
    advisory,
    ...(candidate.values ? { values: candidate.values } : {}),
    ...(candidate.parent ? { parent: candidate.parent } : {}),
  });
}

function parseColonLine(line: string): {
  parent: string;
  values: string[];
  rhs: string;
} | null {
  const match = line.match(/^([^:]+):\s*(.+)$/);
  if (!match) return null;
  const parent = match[1]!.trim();
  const rhs = match[2]!.trim();
  if (!rhs || isSectionLabel(parent)) return null;

  const values = parseCommaList(rhs);
  if (values.length < 2 && !STATUS_PARENT_RE.test(parent) && !KPI_PARENT_RE.test(parent)) {
    return null;
  }
  return { parent, values: values.length > 0 ? values : [rhs], rhs };
}

export function extractPromptRequirements(prompt: string): ExtractedRequirement[] {
  const segments = segmentPrompt(prompt);
  const requirements: ExtractedRequirement[] = [];
  const seen = new Set<string>();
  let sectionParent: string | undefined;
  let index = 0;

  for (const rawLine of segments) {
    const line = stripBullet(rawLine);
    if (!line) continue;

    if (isSectionLabel(line)) {
      sectionParent = line.replace(/:$/, "").trim();
      continue;
    }

    const colon = parseColonLine(line);
    if (colon) {
      sectionParent = undefined;
      const { parent, values } = colon;
      if (STATUS_PARENT_RE.test(parent)) {
        pushRequirement(
          requirements,
          seen,
          {
            label: formatStatusEnumLabel(parent, values),
            type: "status_enum",
            values,
            parent,
          },
          index++,
        );
        continue;
      }
      if (KPI_PARENT_RE.test(parent)) {
        pushRequirement(
          requirements,
          seen,
          {
            label: formatKpiLabel(values),
            type: "feature",
            values,
            parent,
          },
          index++,
        );
        continue;
      }
      pushRequirement(
        requirements,
        seen,
        {
          label: `${parent}: ${values.join(", ")}`,
          type: classifyType(parent, parent, values),
          values,
          parent,
        },
        index++,
      );
      continue;
    }

    if (line.endsWith(":") && isSectionLabel(line.replace(/:$/, ""))) {
      sectionParent = line.replace(/:$/, "").trim();
      continue;
    }

    if (AUDIT_RE.test(line)) {
      sectionParent = undefined;
      pushRequirement(
        requirements,
        seen,
        { label: line, type: "audit_task", advisory: true },
        index++,
      );
      continue;
    }

    if (QUALITY_RE.test(line)) {
      sectionParent = undefined;
      pushRequirement(
        requirements,
        seen,
        { label: line, type: "quality", advisory: !MEASURABLE_QUALITY_RE.test(line) },
        index++,
      );
      continue;
    }

    if (UI_FEATURE_RE.test(line)) {
      sectionParent = undefined;
      pushRequirement(
        requirements,
        seen,
        { label: line, type: "feature" },
        index++,
      );
      continue;
    }

    if (isStandaloneStatusFragment(line)) {
      continue;
    }

    if (/^build\s+.+\s+app\.?$/i.test(line)) {
      continue;
    }

    const sectionLower = sectionParent?.toLowerCase();
    if (sectionLower === "pages" || sectionLower === "page") {
      const pageName = line.replace(/\s+page$/i, "").trim();
      pushRequirement(
        requirements,
        seen,
        {
          label: /page$/i.test(line) ? line : `${pageName} page`,
          type: "page",
          ...(sectionParent ? { parent: sectionParent } : {}),
        },
        index++,
      );
      continue;
    }

    if (sectionLower === "also include" || TECH_RE.test(line)) {
      pushRequirement(
        requirements,
        seen,
        {
          label: line,
          type: "tech",
          parent: sectionParent ?? "tech",
        },
        index++,
      );
      continue;
    }

    if (PAGE_SUFFIX_RE.test(line)) {
      sectionParent = undefined;
      pushRequirement(
        requirements,
        seen,
        { label: line, type: "page" },
        index++,
      );
      continue;
    }

    if (TECH_RE.test(line) || /persist|storage/i.test(line)) {
      pushRequirement(
        requirements,
        seen,
        { label: line, type: "tech" },
        index++,
      );
      continue;
    }

    if (/^(dashboard|customers?|settings?|estimates?|invoices?|jobs?|leads?)$/i.test(line)) {
      pushRequirement(
        requirements,
        seen,
        {
          label: `${line} page`,
          type: "page",
        },
        index++,
      );
      continue;
    }

  if (/with\s+kpi/i.test(line) || /kpi\s+card/i.test(line)) {
      pushRequirement(
        requirements,
        seen,
        { label: line, type: "feature" },
        index++,
      );
      continue;
    }

    if (line.length >= 12) {
      sectionParent = undefined;
      pushRequirement(
        requirements,
        seen,
        {
          label: line,
          type: classifyType(line, sectionParent, undefined),
        },
        index++,
      );
    }
  }

  return requirements;
}

export function isHardRequirement(item: {
  readonly advisory: boolean;
  readonly type: RequirementType;
}): boolean {
  return !item.advisory;
}

export function requirementTypeLabel(
  type: RequirementType,
  advisory: boolean,
): string {
  if (advisory) return `${type}/advisory`;
  return type;
}
