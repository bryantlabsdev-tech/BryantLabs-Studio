export interface EvidenceRef {
  readonly file: string;
  readonly line?: number;
  readonly snippet?: string;
}

interface ImplementationSource {
  readonly path: string;
  readonly content: string;
}

const TAILWIND_UTILITY_RE =
  /\b(?:flex|grid|gap-\d|bg-(?:slate|gray|zinc|neutral|black)|text-(?:slate|gray|zinc|white)|p-\d|px-\d|py-\d|m-\d|rounded(?:-lg|-xl|-md)?|shadow(?:-lg|-md)?|hover:|md:|lg:|sm:|min-h-screen|border-(?:slate|gray))\b/g;

const DARK_DASHBOARD_RE =
  /(?:bg-(?:slate|gray|zinc|neutral)-(?:8|9)\d{2}|background:\s*#(?:0f|1[0-4])|sidebar|dashboard|saas)/i;

const RESPONSIVE_RE =
  /(?:\b(?:sm|md|lg|xl|2xl):|@media\s*\(|max-width|min-width|responsive|mobile)/i;

const ACTIVITY_FEED_RE =
  /(?:recent\s+activity|activity\s+feed|activityFeed|ActivityFeed|last\s+activity)/i;

const TABLE_MOCK_RE =
  /(?:<table|<tbody|mock(?:Data|Customers|Jobs|Leads)?\s*=|sample(?:Data)?\s*=|\[\s*\{[^}]*name:)/i;

const CRUD_BUTTON_RE =
  /(?:add\s+(?:new\s+)?|create\s+|edit\s+|delete\s+|onDelete|onEdit|onCreate|handleDelete|handleEdit|handleCreate).*(?:button|<button|type\s*=\s*["']button["'])/i;

const ROUTING_RE =
  /(?:react-router-dom|BrowserRouter|createBrowserRouter|Routes\b|Route\b|useNavigate|from\s+["']react-router)/i;

function joinContent(sources: readonly ImplementationSource[]): string {
  return sources.map((s) => s.content).join("\n");
}

function firstMatchRef(
  sources: readonly ImplementationSource[],
  pattern: RegExp,
): EvidenceRef | null {
  for (const source of sources) {
    const lines = source.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (pattern.test(lines[index]!)) {
        return {
          file: source.path,
          line: index + 1,
          snippet: lines[index]!.trim().slice(0, 120),
        };
      }
    }
    if (pattern.test(source.content)) {
      return { file: source.path, line: 1 };
    }
  }
  return null;
}

function packageJsonSource(
  sources: readonly ImplementationSource[],
): ImplementationSource | null {
  return sources.find((s) => s.path === "package.json" || s.path.endsWith("/package.json")) ?? null;
}

export function detectReactRouterEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const refs: EvidenceRef[] = [];
  const pkg = packageJsonSource(sources);
  if (pkg && /react-router(?:-dom)?/.test(pkg.content)) {
    refs.push({ file: pkg.path });
  }
  const importRef = firstMatchRef(sources, ROUTING_RE);
  if (importRef) refs.push(importRef);
  return { passed: refs.length > 0, refs };
}

export function detectTailwindEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const refs: EvidenceRef[] = [];
  const pkg = packageJsonSource(sources);
  if (pkg && /tailwindcss/.test(pkg.content)) {
    refs.push({ file: pkg.path });
  }
  const configRef = sources.find((s) => /tailwind\.config/.test(s.path));
  if (configRef) refs.push({ file: configRef.path });

  let utilityHits = 0;
  let utilityRef: EvidenceRef | null = null;
  for (const source of sources) {
    if (!/\.(tsx|jsx|css)$/.test(source.path)) continue;
    const matches = source.content.match(TAILWIND_UTILITY_RE);
    if (matches && matches.length > 0) {
      utilityHits += matches.length;
      if (!utilityRef) {
        utilityRef = { file: source.path, line: 1 };
      }
    }
  }
  if (utilityRef && utilityHits >= 4) refs.push(utilityRef);

  return { passed: refs.length > 0, refs };
}

export function detectLucideEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const refs: EvidenceRef[] = [];
  const pkg = packageJsonSource(sources);
  if (pkg && /lucide-react/.test(pkg.content)) {
    refs.push({ file: pkg.path });
  }
  const importRef = firstMatchRef(sources, /from\s+["']lucide-react["']|lucide-react/);
  if (importRef) refs.push(importRef);
  return { passed: refs.length > 0, refs };
}

export function detectLocalStorageEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const ref = firstMatchRef(sources, /localStorage\.(?:getItem|setItem|removeItem)/);
  return { passed: Boolean(ref), refs: ref ? [ref] : [] };
}

export function detectDarkDashboardEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const content = joinContent(sources);
  const hasDark = DARK_DASHBOARD_RE.test(content);
  const hasDashboard = /dashboard|sidebar|kpi/i.test(content);
  const ref = firstMatchRef(sources, DARK_DASHBOARD_RE);
  return {
    passed: hasDark && hasDashboard,
    refs: ref ? [ref] : [],
  };
}

export function detectResponsiveLayoutEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const ref = firstMatchRef(sources, RESPONSIVE_RE);
  return { passed: Boolean(ref), refs: ref ? [ref] : [] };
}

export function detectActivityFeedEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const ref = firstMatchRef(sources, ACTIVITY_FEED_RE);
  return { passed: Boolean(ref), refs: ref ? [ref] : [] };
}

export function detectTablesWithMockDataEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const tableRef = firstMatchRef(sources, TABLE_MOCK_RE);
  const hasArray = sources.some((s) => /\[\s*\{[\s\S]*?\}\s*,/.test(s.content));
  const ref = tableRef ?? (hasArray ? { file: sources[0]!.path, line: 1 } : null);
  return { passed: Boolean(ref), refs: ref ? [ref] : [] };
}

export function detectCrudButtonEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  const content = joinContent(sources);
  const hasButtons = /<button|type\s*=\s*["']button["']/i.test(content);
  const hasCrud =
    /\b(add|create|edit|update|delete|remove)\b/i.test(content) && hasButtons;
  const ref =
    firstMatchRef(sources, CRUD_BUTTON_RE) ??
    firstMatchRef(sources, /(?:Add|Create|Edit|Delete|Remove).*(?:button|onClick)/i);
  return {
    passed: Boolean(hasCrud && ref),
    refs: ref ? [ref] : [],
  };
}

export function detectRoutingWorksEvidence(
  sources: readonly ImplementationSource[],
): { passed: boolean; refs: EvidenceRef[] } {
  return detectReactRouterEvidence(sources);
}
