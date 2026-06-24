import type { FollowUpResolution, SessionMemorySnapshot } from "@/core/sessionMemory/types";

import { displayNameFromPrompt } from "@/core/domain";

const FOLLOW_UP_RE =
  /\b(it|that|this|the issue|the problem|we just|just created|that feature)\b/i;

const CONTINUATION_EDIT_RE =
  /^(add|make|change|fix|remove|update|improve|enhance|style|move|resize|enable|disable)\b/i;

const SUBJECT_PATTERNS: { re: RegExp; subject: string }[] = [
  { re: /\bcalculator\b/i, subject: "calculator" },
  { re: /\bcomparison\b/i, subject: "comparison" },
  { re: /\bcosmetic/i, subject: "cosmetics" },
  { re: /\bhistory\s*(panel|sidebar|section)?\b/i, subject: "history panel" },
  { re: /\bdark\s*mode\b/i, subject: "dark mode" },
  { re: /\bbutton\b/i, subject: "button" },
  { re: /\bnavbar\b|\bnavigation\b/i, subject: "navigation" },
  { re: /\btheme\b/i, subject: "theme" },
  { re: /\bui\b|\blayout\b/i, subject: "UI layout" },
];

function extractSubjectsFromText(text: string): string[] {
  const found: string[] = [];
  for (const { re, subject } of SUBJECT_PATTERNS) {
    if (re.test(text) && !found.includes(subject)) found.push(subject);
  }
  return found;
}

export interface FollowUpContextHints {
  readonly appNameHint?: string | null;
  readonly projectPath?: string | null;
  readonly priorUserPrompts?: readonly string[];
}

function inferAppNameFromText(text: string): string | null {
  const fromDomain = displayNameFromPrompt(text);
  if (fromDomain !== "App") return fromDomain;
  return null;
}

function inferAppName(
  memory: SessionMemorySnapshot,
  hints?: FollowUpContextHints,
): string | null {
  if (hints?.appNameHint?.trim() && isValidFollowUpSubject(hints.appNameHint)) {
    return hints.appNameHint.trim().charAt(0).toUpperCase() + hints.appNameHint.trim().slice(1);
  }

  const sources: string[] = [];
  for (const p of hints?.priorUserPrompts ?? []) sources.push(p);
  for (const p of memory.prompts) sources.push(p.prompt);
  for (const plan of memory.plans) sources.push(plan.prompt, plan.summary);

  for (const text of sources) {
    const name = inferAppNameFromText(text);
    if (name) return name;
  }
  return null;
}

function inferPrimarySubject(
  memory: SessionMemorySnapshot,
  hints?: FollowUpContextHints,
): string | null {
  const appName = inferAppName(memory, hints);
  if (appName) return appName;

  const sources: string[] = [];
  for (const p of memory.prompts) sources.push(p.prompt);
  for (const plan of memory.plans) {
    sources.push(plan.prompt, plan.summary, ...plan.files.join(" "));
  }
  for (const f of memory.modifiedFiles) sources.push(f);

  const subjects = new Set<string>();
  for (const text of sources) {
    for (const s of extractSubjectsFromText(text)) subjects.add(s);
  }

  if (subjects.has("calculator")) return "calculator";
  if (subjects.has("history panel")) return "history panel";
  const list = [...subjects];
  return list[0] ?? null;
}

function mentionsAppName(prompt: string, appName: string): boolean {
  return prompt.toLowerCase().includes(appName.toLowerCase());
}

/** Reject folder names like "157" or other non-app subjects. */
function isValidFollowUpSubject(subject: string): boolean {
  const t = subject.trim();
  if (!t || t.toLowerCase() === "app") return false;
  if (/^\d+$/.test(t)) return false;
  if (t.length <= 2) return false;
  return true;
}

function hasExplicitAppSubject(prompt: string): boolean {
  if (extractSubjectsFromText(prompt).length > 0) return true;
  return displayNameFromPrompt(prompt) !== "App";
}

function isContinuationPrompt(raw: string): boolean {
  const trimmed = raw.trim();
  if (CONTINUATION_EDIT_RE.test(trimmed)) return true;
  if (/^(make it|make the)\b/i.test(trimmed)) return true;
  return trimmed.split(/\s+/).length <= 6;
}

/** Resolve display app name from hint or prompt text (never numeric folder names). */
export function resolveDisplayAppName(
  prompt: string,
  appNameHint?: string | null,
): string | null {
  if (appNameHint?.trim() && isValidFollowUpSubject(appNameHint)) {
    return appNameHint.trim().charAt(0).toUpperCase() + appNameHint.trim().slice(1);
  }
  return inferAppNameFromText(prompt);
}

/**
 * Append project context without rewriting user pronouns.
 * Current app / project path precede the unchanged user prompt.
 */
export function appendProjectContextBlock(
  rawPrompt: string,
  opts: { appName?: string | null; projectPath?: string | null },
): string {
  const prefixLines: string[] = [];
  const app = resolveDisplayAppName(rawPrompt, opts.appName);
  if (app) prefixLines.push(`Current app: ${app}`);
  if (opts.projectPath?.trim()) {
    prefixLines.push(`Project path: ${opts.projectPath.trim()}`);
  }
  if (prefixLines.length === 0) return rawPrompt;
  return `${prefixLines.join("\n")}\n\n${rawPrompt}`;
}

/**
 * Resolve vague follow-up prompts using recent session history.
 * User pronouns are never replaced with folder names or project ids.
 */
export function resolveFollowUpPrompt(
  rawPrompt: string,
  memory: SessionMemorySnapshot,
  hints?: FollowUpContextHints,
): FollowUpResolution {
  const trimmed = rawPrompt.trim();
  const subject = inferPrimarySubject(memory, hints);
  const appName = inferAppName(memory, hints);
  const displayApp = resolveDisplayAppName(trimmed, hints?.appNameHint ?? appName);
  const hasSession =
    memory.prompts.length > 0 ||
    (hints?.priorUserPrompts?.length ?? 0) > 0 ||
    Boolean(hints?.appNameHint?.trim()) ||
    Boolean(hints?.projectPath?.trim());

  const withContext = appendProjectContextBlock(trimmed, {
    appName: displayApp,
    projectPath: hints?.projectPath ?? null,
  });

  if (
    hasSession &&
    (FOLLOW_UP_RE.test(trimmed) || isContinuationPrompt(trimmed)) &&
    !hasExplicitAppSubject(trimmed) &&
    withContext !== trimmed
  ) {
    const recent = memory.lastPrompt
      ? `Follow-up to: "${memory.lastPrompt}"`
      : "Follow-up using session history";
    return {
      rawPrompt: trimmed,
      effectivePrompt: withContext,
      inferredSubject: subject ?? displayApp,
      reason: `${recent}. Appended project context; prompt text preserved.`,
    };
  }

  if (
    hasSession &&
    appName &&
    isContinuationPrompt(trimmed) &&
    !mentionsAppName(trimmed, appName) &&
    !hasExplicitAppSubject(trimmed)
  ) {
    return {
      rawPrompt: trimmed,
      effectivePrompt: withContext,
      inferredSubject: appName,
      reason: `Continuing work on ${appName}. Appended project context; prompt text preserved.`,
    };
  }

  return {
    rawPrompt: trimmed,
    effectivePrompt: trimmed,
    inferredSubject: subject,
    reason:
      subject && hasSession
        ? `Recent subject in session: ${subject}`
        : "No follow-up context needed",
  };
}

export function mentionsSubject(prompt: string, subject: string): boolean {
  const words = subject.toLowerCase().split(/\s+/);
  const lower = prompt.toLowerCase();
  return words.every((w) => lower.includes(w));
}
