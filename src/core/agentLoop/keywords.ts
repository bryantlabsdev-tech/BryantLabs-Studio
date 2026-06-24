const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "is",
  "are",
  "be",
  "make",
  "add",
  "fix",
  "update",
  "upgrade",
  "change",
  "like",
  "look",
  "with",
  "and",
  "or",
  "it",
  "this",
  "that",
  "my",
  "app",
  "application",
  "please",
  "need",
  "want",
  "should",
  "would",
  "into",
  "from",
  "using",
  "use",
]);

/** Extract repository search terms from a natural-language goal. */
export function extractSearchTerms(goal: string): string[] {
  const terms = new Set<string>();
  const quoted = goal.match(/["']([^"']{2,40})["']/g);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.slice(1, -1).trim();
      if (inner) terms.add(inner);
    }
  }

  const camel = goal.match(/\b[A-Z][a-zA-Z0-9]+\b/g);
  if (camel) {
    for (const c of camel) terms.add(c);
  }

  const words = goal
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  for (const w of words) {
    const lower = w.toLowerCase();
    if (STOP.has(lower)) continue;
    if (lower.length >= 4) terms.add(w);
  }

  const domain = [
    "calculator",
    "auth",
    "authentication",
    "login",
    "signup",
    "dashboard",
    "button",
    "header",
    "footer",
    "navbar",
    "theme",
    "styles",
    "css",
    "component",
    "api",
    "route",
    "router",
  ];
  const lowerGoal = goal.toLowerCase();
  for (const d of domain) {
    if (lowerGoal.includes(d)) terms.add(d);
  }

  return [...terms].slice(0, 6);
}

export function primarySearchTerm(goal: string, tried: readonly string[]): string[] {
  const all = extractSearchTerms(goal);
  return all.filter((t) => !tried.some((x) => x.toLowerCase() === t.toLowerCase()));
}
