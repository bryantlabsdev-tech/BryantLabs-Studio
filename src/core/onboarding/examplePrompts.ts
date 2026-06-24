/** Starter prompts shown on first-run welcome and greenfield empty states. */
export const WELCOME_EXAMPLE_PROMPTS = [
  "Build a product comparison app for cosmetics",
  "Build a CRM dashboard",
  "Build a task manager",
  "Build a Sudoku game",
] as const;

export type WelcomeExamplePrompt = (typeof WELCOME_EXAMPLE_PROMPTS)[number];
