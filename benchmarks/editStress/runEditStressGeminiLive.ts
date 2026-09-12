import {
  openProjectWorkspace,
} from "./fixtureWorkspace";
import {
  resolveGeminiApiKeyForStress,
  resolveGeminiModelForStress,
} from "./geminiApi";
import { editStressPromptById, type EditStressPrompt } from "./prompts";
import {
  runEditStressProviderCase,
  runEditStressProviderSuite,
  type EditStressProviderResult,
  type EditStressProviderSuiteResult,
} from "./runEditStressProvider";

export interface EditStressGeminiLiveResult extends EditStressProviderResult {
  readonly geminiModel: string;
  readonly latencyMs?: number;
}

export function requireGeminiApiKeyForStress(): string {
  const apiKey = resolveGeminiApiKeyForStress();
  if (!apiKey) {
    throw new Error(
      "Missing Gemini API key. Set GEMINI_API_KEY, GOOGLE_API_KEY, or BRYANTLABS_GEMINI_API_KEY.",
    );
  }
  return apiKey;
}

function resolvePrompt(input?: {
  readonly promptId?: string;
  readonly promptText?: string;
}): EditStressPrompt {
  const base =
    (input?.promptId ? editStressPromptById(input.promptId) : undefined) ??
    editStressPromptById("sudoku-hints");
  if (!base) {
    throw new Error(`Unknown edit stress prompt: ${input?.promptId ?? "sudoku-hints"}`);
  }
  if (!input?.promptText?.trim()) return base;
  return { ...base, prompt: input.promptText.trim() };
}

export async function runEditStressGeminiLiveOnProject(input: {
  readonly projectPath: string;
  readonly promptText?: string;
  readonly promptId?: string;
  readonly skipVerify?: boolean;
}): Promise<EditStressGeminiLiveResult & { readonly projectPath: string }> {
  const apiKey = requireGeminiApiKeyForStress();
  const model = resolveGeminiModelForStress();
  const prompt = resolvePrompt({
    promptId: input.promptId,
    promptText: input.promptText ?? "add hints",
  });
  const workspace = await openProjectWorkspace(input.projectPath);
  const result = await runEditStressProviderCase(prompt, {
    workspace,
    liveGemini: { apiKey, model },
    ...(input.skipVerify ? { skipVerify: true } : {}),
  });
  return {
    ...result,
    geminiModel: model,
    projectPath: workspace.root,
  };
}

export async function runEditStressGeminiLiveCase(input?: {
  readonly promptId?: string;
  readonly promptText?: string;
  readonly skipVerify?: boolean;
}): Promise<EditStressGeminiLiveResult> {
  const apiKey = requireGeminiApiKeyForStress();
  const model = resolveGeminiModelForStress();
  const prompt = resolvePrompt(input);
  const result = await runEditStressProviderCase(prompt, {
    liveGemini: { apiKey, model },
    ...(input?.skipVerify ? { skipVerify: true } : {}),
  });
  return {
    ...result,
    geminiModel: model,
  };
}

export async function runEditStressGeminiLiveSuite(input?: {
  readonly promptIds?: readonly string[];
  readonly skipVerify?: boolean;
}): Promise<EditStressProviderSuiteResult> {
  const apiKey = requireGeminiApiKeyForStress();
  const model = resolveGeminiModelForStress();
  const promptIds = input?.promptIds?.length
    ? input.promptIds
    : (["sudoku-hints"] as const);
  return runEditStressProviderSuite({
    promptIds: [...promptIds],
    skipVerify: input?.skipVerify,
    liveGemini: { apiKey, model },
  });
}
