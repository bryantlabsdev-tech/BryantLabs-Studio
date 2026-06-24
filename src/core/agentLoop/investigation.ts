const INVESTIGATION_PATTERNS = [
  /\bwhy\b/i,
  /\bfail(?:ing|ed|s)?\b/i,
  /\bbroken\b/i,
  /\berror\b/i,
  /\bdebug\b/i,
  /\binvestigat/i,
  /\broot\s+cause\b/i,
  /\bdoesn'?t\s+work\b/i,
  /\bnot\s+working\b/i,
  /\bbuild\s+fail/i,
  /\btypecheck\s+fail/i,
];

/** Detect prompts that should explore before editing. */
export function detectAgentLoopMode(goal: string): "investigation" | "goal" {
  const g = goal.trim();
  if (!g) return "goal";
  return INVESTIGATION_PATTERNS.some((re) => re.test(g))
    ? "investigation"
    : "goal";
}

/** Pull likely symbol names from verification output lines. */
export function symbolsFromDiagnostics(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /Cannot find name '([^']+)'/g,
    /Module '"([^"]+)"' has no exported member '([^']+)'/g,
    /'([^']+)' is not defined/g,
    /import\s+{\s*([^}]+)\s*}/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const cap = m[m.length - 1];
      if (!cap) continue;
      for (const part of cap.split(/[,\s]+/)) {
        const name = part.trim().replace(/^type\s+/, "");
        if (name.length >= 2 && /^[A-Z][A-Za-z0-9]*$/.test(name)) {
          out.add(name);
        }
      }
    }
  }
  return [...out].slice(0, 8);
}
