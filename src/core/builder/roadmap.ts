import type { BuildGoal, BuilderPhase } from "@/core/builder/types";

export type AppKind = "task_manager" | "crm" | "calculator" | "generic";

interface PhaseTemplate {
  title: string;
  description: string;
  major: boolean;
}

const TEMPLATES: Record<AppKind, PhaseTemplate[]> = {
  task_manager: [
    { title: "Core UI", description: "Shell, layout, and task list scaffold.", major: true },
    { title: "Task CRUD", description: "Add, edit, complete, and delete tasks.", major: false },
    { title: "Filters", description: "Filter and sort tasks by status and priority.", major: false },
    { title: "Persistence", description: "Local storage or state persistence for tasks.", major: true },
    { title: "Polish", description: "UX polish, empty states, and responsive layout.", major: true },
  ],
  crm: [
    { title: "Core layout", description: "App shell, navigation, and dashboard frame.", major: true },
    { title: "Contacts CRUD", description: "Contact list, detail view, and forms.", major: false },
    { title: "Pipeline view", description: "Deal stages and pipeline board.", major: false },
    { title: "Data layer", description: "Models, mock data, and persistence hooks.", major: true },
    { title: "Polish", description: "Styling, validation, and empty states.", major: true },
  ],
  calculator: [
    { title: "Calculator UI", description: "Display, keypad, and layout.", major: true },
    { title: "Operations logic", description: "Arithmetic, clear, and equals behavior.", major: false },
    { title: "Styling & polish", description: "Theme, buttons, and responsive design.", major: true },
  ],
  generic: [
    { title: "Core structure", description: "App entry, routing, and base layout.", major: true },
    { title: "Main features", description: "Primary user-facing functionality.", major: false },
    { title: "Data & state", description: "State management and data flow.", major: false },
    { title: "Integration", description: "Wire features together and shared utilities.", major: true },
    { title: "Polish", description: "Styles, edge cases, and UX refinement.", major: true },
  ],
};

export function inferAppKind(prompt: string): AppKind {
  const t = prompt.toLowerCase();
  if (/task\s*manager|todo|to-do|checklist/.test(t)) return "task_manager";
  if (/\bcrm\b|customer\s*relationship|contacts?\s*manager|sales\s*pipeline/.test(t)) {
    return "crm";
  }
  if (/calculator|calc\s*app/.test(t)) return "calculator";
  return "generic";
}

export function extractGoalTitle(rawPrompt: string): string {
  const trimmed = rawPrompt.trim();
  const buildMatch = trimmed.match(
    /^\s*build\s+(?:a|an)?\s*(.+?)\s*(?:app|application)?\s*$/i,
  );
  if (buildMatch?.[1]) {
    const title = buildMatch[1].trim();
    return title.length > 0 ? capitalizeWords(title) : "Application";
  }
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed || "Application";
}

function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildPhasePrompt(goal: BuildGoal, phase: PhaseTemplate, index: number): string {
  return [
    `Application goal: ${goal.rawPrompt}`,
    `Phase ${index + 1} — ${phase.title}: ${phase.description}`,
    `Implement only what this phase requires; keep changes focused and coherent.`,
  ].join(" ");
}

export function buildRoadmap(goal: BuildGoal): BuilderPhase[] {
  const kind = inferAppKind(goal.rawPrompt);
  const template = TEMPLATES[kind];
  return template.map((t, index) => {
    const id = `phase-${index + 1}`;
    return {
      id,
      index,
      title: t.title,
      description: t.description,
      prompt: buildPhasePrompt(goal, t, index),
      major: t.major,
      status: "pending" as const,
      repairAttempts: 0,
      filesModified: [],
      filesCreated: [],
      startedAt: null,
      completedAt: null,
      error: null,
    };
  });
}

export function roadmapSummaryLines(phases: readonly BuilderPhase[]): string[] {
  return [
    "Build Roadmap:",
    ...phases.map((p) => `Phase ${p.index + 1}: ${p.title}`),
  ];
}
