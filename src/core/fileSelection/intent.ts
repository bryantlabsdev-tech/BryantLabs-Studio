import { tokenize } from "@/core/planner/tokenize";
import { detectSymbolFeatures } from "@/core/repository/symbolFeatures";
import type { PromptIntent } from "@/core/fileSelection/types";

const SCREEN_TERMS = [
  "page",
  "screen",
  "view",
  "panel",
  "tab",
  "modal",
  "dialog",
  "drawer",
  "route",
] as const;

const UI_ELEMENT_TERMS = [
  "button",
  "card",
  "cards",
  "form",
  "input",
  "dropdown",
  "menu",
  "sidebar",
  "header",
  "footer",
  "table",
  "list",
  "grid",
  "chart",
  "timeline",
  "kpi",
  "badge",
  "tooltip",
  "toast",
  "navbar",
] as const;

const BUSINESS_TERMS = [
  "crm",
  "customer",
  "client",
  "lead",
  "pipeline",
  "deal",
  "invoice",
  "order",
  "product",
  "inventory",
  "analytics",
  "report",
  "activity",
  "history",
  "auth",
  "login",
  "signup",
  "billing",
  "subscription",
] as const;

function camelChunks(text: string): string[] {
  const parts = text.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [];
  return parts.map((p) => p.toLowerCase()).filter((p) => p.length > 1);
}

function pushUnique(list: string[], value: string): void {
  const v = value.trim().toLowerCase();
  if (!v || v.length < 2) return;
  if (!list.includes(v)) list.push(v);
}

/** Analyze prompt for features, components, screens, and business concepts. */
export function detectPromptIntent(prompt: string): PromptIntent {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const tokens = tokenize(trimmed);

  const features: string[] = [];
  const components: string[] = [];
  const screens: string[] = [];
  const functions: string[] = [];
  const keywords: string[] = [...tokens];
  const uiElements: string[] = [];
  const businessConcepts: string[] = [];

  for (const hint of detectSymbolFeatures(lower)) {
    pushUnique(features, hint.id);
    for (const name of hint.symbolNames) {
      pushUnique(components, name);
    }
    for (const frag of hint.pathFragments) {
      pushUnique(keywords, frag);
    }
  }

  for (const term of SCREEN_TERMS) {
    if (lower.includes(term)) pushUnique(screens, term);
  }

  for (const term of UI_ELEMENT_TERMS) {
    if (lower.includes(term)) pushUnique(uiElements, term);
  }

  for (const term of BUSINESS_TERMS) {
    if (lower.includes(term)) pushUnique(businessConcepts, term);
  }

  const fnMatch = lower.match(
    /\b(create|update|delete|get|fetch|handle)[A-Z][a-zA-Z0-9]*/g,
  );
  if (fnMatch) {
    for (const m of fnMatch) pushUnique(functions, m);
  }

  for (const chunk of camelChunks(trimmed)) {
    if (chunk.startsWith("use") && chunk.length > 3) continue;
    if (/^(create|update|delete|get|set|handle|on)/.test(chunk)) {
      pushUnique(functions, chunk);
    } else if (
      ["dashboard", "client", "note", "activity", "timeline", "analytics"].includes(
        chunk,
      )
    ) {
      pushUnique(components, chunk);
      pushUnique(features, chunk);
    }
  }

  const quoted = trimmed.match(/["'`]([^"'`]{2,40})["'`]/g);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/["'`]/g, "").trim();
      pushUnique(keywords, inner);
      pushUnique(features, inner);
    }
  }

  return {
    features,
    components,
    screens,
    functions,
    keywords,
    uiElements,
    businessConcepts,
  };
}

/** Tags for historical learning (features + components + business terms). */
export function intentFeatureTags(intent: PromptIntent): string[] {
  const tags: string[] = [];
  for (const list of [
    intent.features,
    intent.components,
    intent.businessConcepts,
    intent.uiElements,
  ]) {
    for (const t of list) {
      const v = t.trim().toLowerCase();
      if (v && !tags.includes(v)) tags.push(v);
    }
  }
  return tags;
}

export function formatIntentSummary(intent: PromptIntent): string {
  const parts: string[] = [];
  if (intent.features.length) parts.push(`features: ${intent.features.join(", ")}`);
  if (intent.components.length) {
    parts.push(`components: ${intent.components.join(", ")}`);
  }
  if (intent.screens.length) parts.push(`screens: ${intent.screens.join(", ")}`);
  if (intent.businessConcepts.length) {
    parts.push(`concepts: ${intent.businessConcepts.join(", ")}`);
  }
  if (intent.uiElements.length) {
    parts.push(`UI: ${intent.uiElements.join(", ")}`);
  }
  if (intent.keywords.length) {
    parts.push(`keywords: ${intent.keywords.slice(0, 12).join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "general modification";
}
