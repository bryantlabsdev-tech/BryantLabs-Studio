import type { GreenfieldProjectFilePath } from "@/core/greenfield/types";

export interface GreenfieldManifest {
  readonly appName: string;
  readonly useTailwind: boolean;
  readonly useRouter: boolean;
  readonly useLucide: boolean;
  readonly useLocalStorage: boolean;
  readonly pages: readonly GreenfieldPageSpec[];
  readonly sharedPaths: readonly GreenfieldProjectFilePath[];
  readonly pagePaths: readonly GreenfieldProjectFilePath[];
  readonly integrationPath: "src/App.tsx";
}

export interface GreenfieldPageSpec {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly path: GreenfieldProjectFilePath;
}

/** FieldFlow CRM benchmark pages — only when prompt is FieldFlow or no pages listed. */
const FIELDFLOW_DEFAULT_PAGES: readonly { title: string; route: string }[] = [
  { title: "Dashboard", route: "/" },
  { title: "Leads", route: "/leads" },
  { title: "Jobs", route: "/jobs" },
  { title: "Estimates", route: "/estimates" },
  { title: "Invoices", route: "/invoices" },
  { title: "Customers", route: "/customers" },
  { title: "Settings", route: "/settings" },
];

/** Generic fallback when no explicit pages are provided (not FieldFlow-specific). */
const GENERIC_DEFAULT_PAGES: readonly { title: string; route: string }[] = [
  { title: "Dashboard", route: "/" },
  { title: "Settings", route: "/settings" },
];

function slug(title: string): string {
  return title.replace(/\s+/g, "");
}

function routeForTitle(title: string): string {
  if (title.toLowerCase() === "dashboard") return "/";
  return `/${title.toLowerCase().replace(/\s+/g, "-")}`;
}

const PAGE_SECTION_STOP =
  /^(requirements?|dashboard kpis?|lead statuses?|job statuses?|invoice statuses?|also include|after building|goal|use|acceptance|stack)\s*:/i;

const AUDIT_LINE =
  /^(check|verify|ensure)\b/i;

function isValidPageTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (AUDIT_LINE.test(t)) return false;
  if (/typescript|local\s*storage|mobile\s*layout|crud|visual\s*polish|routing\s*works|no typescript/i.test(t)) {
    return false;
  }
  return /^[A-Za-z][A-Za-z0-9\s/&-]*$/.test(t);
}

/**
 * Feature-requirement bullets ("Dashboard with…", "Light and dark themes")
 * must not become route pages. Only short noun page names qualify.
 */
export function isPageNameTitle(title: string): boolean {
  if (!isValidPageTitle(title)) return false;
  const t = title.trim();
  if (/\bwith\b/i.test(t)) return false;
  if (
    /^(responsive|light|dark|form|empty|seed|local|reusable|no |add |use |include )/i.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /\b(validation|persistence|notification|confirmation|controls|states|schema|themes?|navigation|demo\s*data|import|export)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 3) return false;
  // "Calendar-style due-date view" → hyphenated feature phrasing
  if (/-style\b|\bdue-date\b|\bview\b$/i.test(t) && words.length > 1) return false;
  return true;
}

/** Normalize "Projects page" / "Task list" → proper page titles. */
function normalizePageTitle(raw: string): string | null {
  const t = raw.trim();
  const pageSuffix = t.match(/^([A-Za-z][A-Za-z0-9\s/&-]{0,28}?)\s+page$/i);
  if (pageSuffix?.[1] && isPageNameTitle(pageSuffix[1])) {
    return pageSuffix[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const listSuffix = t.match(/^([A-Za-z][A-Za-z0-9\s/&-]{0,28}?)\s+list$/i);
  if (listSuffix?.[1] && isPageNameTitle(listSuffix[1])) {
    const base = listSuffix[1].trim();
    if (/^task$/i.test(base)) return "Tasks";
    return base.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (!isPageNameTitle(t)) return null;
  return t;
}

function parsePageLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const numbered = trimmed.match(/^\d+[.)]\s+(.+?)\s*$/);
  if (numbered?.[1]) return numbered[1].trim();
  const bullet = trimmed.match(/^[-*•]\s+(.+?)\s*$/);
  if (bullet?.[1]) return bullet[1].trim();
  return null;
}

function dedupePages(
  pages: readonly { title: string; route: string }[],
): { title: string; route: string }[] {
  const seen = new Set<string>();
  const out: { title: string; route: string }[] = [];
  for (const page of pages) {
    const key = page.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(page);
  }
  return out;
}

function pagesFromLines(
  lines: readonly string[],
  startIdx: number,
  stopAtSection: boolean,
  /** When true (Pages: section), allow slightly looser titles; still reject feature bullets. */
  requirePageName = true,
): { title: string; route: string }[] {
  const numbered: { title: string; route: string }[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (stopAtSection && PAGE_SECTION_STOP.test(trimmed)) break;
    if (stopAtSection && trimmed === "" && numbered.length >= 2) break;

    const raw = parsePageLine(lines[i]!);
    if (!raw) continue;
    const title = requirePageName ? normalizePageTitle(raw) : isValidPageTitle(raw) ? raw : null;
    if (!title) continue;
    numbered.push({ title, route: routeForTitle(title) });
  }

  return numbered;
}

function detectExplicitPagesSection(
  prompt: string,
): readonly { title: string; route: string }[] {
  const lines = prompt.split("\n");
  const pagesHeaderIdx = lines.findIndex((l) =>
    /(?:^|\b)pages?\s*:\s*$/i.test(l.trim()),
  );
  if (pagesHeaderIdx < 0) return [];

  const parsed = pagesFromLines(lines, pagesHeaderIdx + 1, true);
  return dedupePages(parsed);
}

function detectInlineNumberedPages(
  prompt: string,
): readonly { title: string; route: string }[] {
  const lines = prompt.split("\n");
  // Require page-name titles so Include: feature bullets never become routes.
  const parsed = pagesFromLines(lines, 0, false, true);
  return dedupePages(parsed);
}

/**
 * Infer real app screens from prose when the prompt describes features
 * ("Projects page", "Task list", "Calendar-style due-date view") without a Pages: section.
 */
export function detectImpliedAppPages(
  prompt: string,
): readonly { title: string; route: string }[] {
  const pages: { title: string; route: string }[] = [];
  const add = (title: string) => {
    if (pages.some((p) => p.title.toLowerCase() === title.toLowerCase())) return;
    pages.push({ title, route: routeForTitle(title) });
  };

  if (/\bdashboard\b/i.test(prompt)) add("Dashboard");
  if (/\bprojects?\s+page\b|\bmanage(?:ment)?\s+of\s+projects\b|\bproject-management\b/i.test(prompt)) {
    add("Projects");
  }
  if (/\btask\s+list\b|\btasks?\s+page\b|\btasks?\s+with\b/i.test(prompt)) add("Tasks");
  if (/\bteam\s+page\b|\bteam\s+members?\b|\bmember\s+profiles\b/i.test(prompt)) {
    add("Team");
  }
  if (/\bcalendar[- ]style\b|\bdue-date\s+view\b|\bcalendar\b/i.test(prompt)) {
    add("Calendar");
  }
  if (/\bactivity\s+timeline\b|\bactivity\s+feed\b/i.test(prompt)) add("Activity");
  if (/\bkanban\b|\bboard\b/i.test(prompt) && !pages.some((p) => p.title === "Tasks")) {
    add("Board");
  }
  if (/\bsettings\b/i.test(prompt) && pages.length >= 2) add("Settings");

  return pages;
}

function isFieldFlowPrompt(prompt: string): boolean {
  return /fieldflow/i.test(prompt);
}

function resolveDefaultPages(prompt: string): readonly { title: string; route: string }[] {
  if (isFieldFlowPrompt(prompt)) return FIELDFLOW_DEFAULT_PAGES;
  return GENERIC_DEFAULT_PAGES;
}

/** Extract page list — explicit Pages section first, then numbered list, then implied, then defaults. */
export function detectPagesFromPrompt(
  prompt: string,
): readonly { title: string; route: string }[] {
  const fromSection = detectExplicitPagesSection(prompt);
  if (fromSection.length >= 1) return fromSection.slice(0, 12);

  const fromNumbered = detectInlineNumberedPages(prompt);
  if (fromNumbered.length >= 2) return fromNumbered.slice(0, 12);

  const implied = detectImpliedAppPages(prompt);
  if (implied.length >= 2) return implied.slice(0, 12);

  return resolveDefaultPages(prompt);
}

function extractAppName(prompt: string): string {
  const patterns = [
    /(?:app(?:lication)?|project)\s+called\s+([A-Za-z][A-Za-z0-9_-]*)/i,
    /called\s+([A-Za-z][A-Za-z0-9_-]*)/i,
    /build\s+([A-Za-z][A-Za-z0-9_-]*)\s*(?:—|--|-|\.|:|$)/i,
    /create\s+([A-Za-z][A-Za-z0-9_-]*)\s*(?:—|--|-|\.|:|$)/i,
    /^([A-Za-z][A-Za-z0-9_-]*)\s+(?:fleet|saas|app|dashboard)/im,
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (m?.[1] && m[1].length > 1) return m[1];
  }
  const title = prompt.match(/title[:\s]+([A-Za-z][A-Za-z0-9 _-]{2,40})/i);
  if (title?.[1]) return title[1].trim().replace(/\s+/g, "");
  return "App";
}

export function planManifestFromPrompt(userPrompt: string): GreenfieldManifest {
  const text = userPrompt.trim();
  const appName = extractAppName(text);
  const useTailwind = /tailwind/i.test(text);
  const useRouter = /react router|routing|pages?\s*:/i.test(text);
  const useLucide = /lucide/i.test(text);
  const useLocalStorage = /localstorage|local storage|persist/i.test(text);

  const pageSpecs = detectPagesFromPrompt(text).map((p) => ({
    id: slug(p.title).toLowerCase(),
    title: p.title,
    route: p.route,
    path: `src/pages/${slug(p.title)}.tsx` as GreenfieldProjectFilePath,
  }));

  const sharedPaths: GreenfieldProjectFilePath[] = [
    "src/types.ts",
    ...(useLocalStorage ? (["src/hooks/useLocalStorage.ts"] as const) : []),
    "src/components/Layout.tsx",
    "src/components/Sidebar.tsx",
  ];

  return {
    appName,
    useTailwind,
    useRouter: useRouter || pageSpecs.length > 1,
    useLucide,
    useLocalStorage,
    pages: pageSpecs,
    sharedPaths,
    pagePaths: pageSpecs.map((p) => p.path),
    integrationPath: "src/App.tsx",
  };
}

export function allManifestPaths(manifest: GreenfieldManifest): GreenfieldProjectFilePath[] {
  return [
    ...manifest.sharedPaths,
    ...manifest.pagePaths,
    manifest.integrationPath,
  ];
}
