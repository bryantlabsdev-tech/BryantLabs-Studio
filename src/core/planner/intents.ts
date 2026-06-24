import { matchAuthenticationDependency } from "@/core/intelligence/authDependency";
import type { Impact } from "@/core/planner/types";

/**
 * Deterministic intent rules. Each rule maps prompt keywords to file/symbol
 * patterns and a set of proposed-change descriptions. These are heuristics —
 * plain pattern knowledge about common web/app tasks — not AI.
 */
export interface IntentRule {
  id: string;
  label: string;
  keywords: string[];
  filePatterns: RegExp[];
  symbolPatterns: RegExp[];
  changeTemplates: string[];
  baseImpact: Impact;
}

export interface DetectedIntent {
  rule: IntentRule;
  matchedKeywords: string[];
}

const RULES: IntentRule[] = [
  {
    id: "theme",
    label: "Theme / dark mode",
    keywords: [
      "dark",
      "mode",
      "theme",
      "light",
      "color",
      "colour",
      "palette",
      "appearance",
      "ui",
      "premium",
      "modern",
      "redesign",
    ],
    filePatterns: [/theme/i, /color/i, /\.s?css$/i, /tailwind\.config/i, /styles?/i, /global/i],
    symbolPatterns: [/theme/i, /color/i, /dark/i, /mode/i, /palette/i],
    changeTemplates: [
      "Introduce a light/dark theme concept (e.g. CSS variables or a `data-theme` attribute).",
      "Add a theme toggle control and persist the chosen mode.",
      "Update global and component styles to consume the theme variables.",
    ],
    baseImpact: "Medium",
  },
  {
    id: "auth",
    label: "Authentication / login",
    keywords: [
      "login",
      "signin",
      "signup",
      "register",
      "logout",
      "password",
      "accounts",
      "users",
      "profiles",
      "oauth",
      "authentication",
    ],
    filePatterns: [/login/i, /auth/i, /signin/i, /signup/i, /session/i, /account/i, /(pages|app|routes|views|screens)[/\\]/i],
    symbolPatterns: [/login/i, /auth/i, /signin/i, /signup/i, /session/i, /user/i],
    changeTemplates: [
      "Create a login page/route with a credentials form.",
      "Add auth state handling and guarding for protected views.",
      "Wire navigation/links to the new login route.",
    ],
    baseImpact: "High",
  },
  {
    id: "navigation",
    label: "Navigation / header",
    keywords: ["navbar", "nav", "navigation", "header", "menu", "topbar", "toolbar", "breadcrumb"],
    filePatterns: [/nav/i, /header/i, /menu/i, /topbar/i, /toolbar/i, /breadcrumb/i],
    symbolPatterns: [/nav/i, /header/i, /menu/i, /topbar/i, /toolbar/i],
    changeTemplates: [
      "Locate the navigation/header component and adjust its layout and spacing.",
      "Update the related CSS (padding, margin, gap, alignment).",
    ],
    baseImpact: "Low",
  },
  {
    id: "routing",
    label: "Routing / new page",
    keywords: ["page", "route", "routing", "screen", "view", "navigate", "link", "router"],
    filePatterns: [/(pages|app|routes|views|screens)[/\\]/i, /router/i, /route/i],
    symbolPatterns: [/route/i, /router/i, /page/i, /screen/i],
    changeTemplates: [
      "Add a new page/route component.",
      "Register the route in the router or navigation configuration.",
    ],
    baseImpact: "Medium",
  },
  {
    id: "form",
    label: "Form / input",
    keywords: ["form", "input", "field", "validation", "validate", "submit"],
    filePatterns: [/form/i, /input/i, /field/i],
    symbolPatterns: [/form/i, /input/i, /field/i, /validate/i],
    changeTemplates: [
      "Build or extend the form with the required fields.",
      "Add validation and submission handling.",
    ],
    baseImpact: "Medium",
  },
  {
    id: "data",
    label: "Data / API",
    keywords: ["api", "fetch", "request", "endpoint", "data", "service", "http", "query"],
    filePatterns: [/api/i, /service/i, /client/i, /fetch/i, /http/i, /query/i],
    symbolPatterns: [/fetch/i, /api/i, /service/i, /client/i, /request/i, /query/i],
    changeTemplates: [
      "Add or update a data-fetching/service module.",
      "Surface loading and error states in the relevant UI.",
    ],
    baseImpact: "Medium",
  },
  {
    id: "styling",
    label: "Styling / layout",
    keywords: [
      "style",
      "css",
      "spacing",
      "margin",
      "padding",
      "layout",
      "responsive",
      "design",
      "align",
      "gap",
      "ui",
      "styling",
      "premium",
      "modern",
      "redesign",
      "calculator",
    ],
    filePatterns: [
      /\.s?css$/i,
      /styles?/i,
      /layout/i,
      /\/App\.tsx$/i,
      /\/App\.jsx$/i,
      /\/index\.css$/i,
      /\/App\.css$/i,
    ],
    symbolPatterns: [],
    changeTemplates: [
      "Adjust the relevant stylesheet(s) and component styles.",
    ],
    baseImpact: "Low",
  },
];

const GENERIC: IntentRule = {
  id: "generic",
  label: "General modification",
  keywords: [],
  filePatterns: [],
  symbolPatterns: [],
  changeTemplates: [
    "Identify the components/modules related to the request and adjust them.",
    "Update related styles and wiring as needed.",
  ],
  baseImpact: "Medium",
};

export function detectIntent(
  tokens: string[],
  promptLower: string,
): DetectedIntent {
  const tokenSet = new Set(tokens);
  let best: DetectedIntent | null = null;

  for (const rule of RULES) {
    const matched =
      rule.id === "auth"
        ? (() => {
            const hit = matchAuthenticationDependency(promptLower);
            return hit.required && hit.ruleId ? [hit.ruleId] : [];
          })()
        : rule.keywords.filter(
            (k) => tokenSet.has(k) || promptLower.includes(k),
          );
    if (matched.length === 0) continue;
    if (!best || matched.length > best.matchedKeywords.length) {
      best = { rule, matchedKeywords: [...new Set(matched)] };
    }
  }

  return best ?? { rule: GENERIC, matchedKeywords: [] };
}
