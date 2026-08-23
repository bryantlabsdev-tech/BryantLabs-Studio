import type { ActiveEditorContext } from "@/core/context/activeEditorContext";
import {
  consultationPreviewLine,
  MIXED_EDIT_CONFIRM_QUESTION,
  type AgentPromptIntent,
} from "@/core/agent/agentIntentRouter";
import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";
import type { BryantLabsApi } from "@/types";
import type { ProjectScan } from "@/types";
import { normalizeProviderSettings } from "@/core/providers/orchestration";

export interface AgentConsultationInput {
  readonly api: BryantLabsApi;
  readonly projectPath: string;
  readonly prompt: string;
  readonly intent: AgentPromptIntent;
  readonly mixedEdit?: boolean;
  readonly scan?: ProjectScan | null;
  readonly activeEditorContext?: ActiveEditorContext | null;
}

export interface AgentConsultationResult {
  readonly ok: boolean;
  readonly text: string;
  readonly provider?: string;
  readonly model?: string;
  readonly error?: string;
}

function buildEditorContextBlock(context: ActiveEditorContext | null | undefined): string {
  if (!context?.relPath) return "";
  const parts = [
    `Active file: ${context.relPath}`,
    context.selection?.text
      ? `Selected lines ${context.selection.startLine}-${context.selection.endLine}:\n${context.selection.text}`
      : null,
    context.content && !context.selection?.text
      ? `File content (truncated):\n${context.content.slice(0, 8000)}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? `\n\n## Editor context\n${parts.join("\n\n")}` : "";
}

function buildConsultationPrompt(input: AgentConsultationInput): string {
  const editorBlock = buildEditorContextBlock(input.activeEditorContext);
  const projectLine = input.projectPath
    ? `Project: ${input.projectPath}`
    : "Project: (unknown)";

  const taskByIntent: Record<AgentPromptIntent, string> = {
    explain:
      "Explain the relevant code clearly. Do NOT propose file edits or patches. Respond in markdown.",
    review:
      "Review the code and suggest improvements. Do NOT modify files. List concrete suggestions only.",
    analyze:
      "Analyze the project structure and report findings. Do NOT modify files. Summarize risks and opportunities.",
    search:
      "Help the user find what they are looking for in the codebase. Describe likely locations and search strategy. Do NOT edit files.",
    ask: "Answer the user's question using the project context when helpful. Do NOT edit files.",
    edit: "Answer without making edits.",
    refactor: "Answer without making edits.",
    generate: "Answer without making edits.",
    run: "Describe what command would run; do not edit files.",
    terminal: "Describe the terminal command; do not edit files.",
  };

  const mixedSuffix = input.mixedEdit
    ? "\n\nAfter explaining, list suggested code improvements as bullet points. Do NOT apply changes."
    : "";

  return [
    "You are BryantLabs Studio — a coding assistant inside an IDE.",
    projectLine,
    `Task: ${taskByIntent[input.intent]}`,
    editorBlock,
    "",
    `User request:\n${input.prompt.trim()}`,
    mixedSuffix,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function extractTerminalCommand(prompt: string): string | null {
  const trimmed = prompt.trim();
  const backtick = trimmed.match(/`([^`]+)`/);
  if (backtick?.[1]) return backtick[1].trim();
  const runMatch = trimmed.match(/\brun\s+(.+)$/i);
  if (runMatch?.[1]) return runMatch[1].trim();
  if (/^(npm|npx|git|node)\s+/i.test(trimmed)) return trimmed;
  return null;
}

export async function runAgentConsultation(
  input: AgentConsultationInput,
): Promise<AgentConsultationResult> {
  const settings = normalizeProviderSettings(await input.api.getProviderSettings());
  const provider = settings.provider;
  const consultationPrompt = buildConsultationPrompt(input);

  try {
    const res = await input.api.testProvider(provider, consultationPrompt);
    if (!res.ok || !res.text?.trim()) {
      return {
        ok: false,
        text: "",
        provider,
        model: res.model,
        error: res.error ?? "Provider returned an empty response.",
      };
    }

    let text = res.text.trim();
    if (input.mixedEdit) {
      text = `${text}\n\n${MIXED_EDIT_CONFIRM_QUESTION}`;
    }

    return {
      ok: true,
      text,
      provider,
      model: res.model,
    };
  } catch (err) {
    return {
      ok: false,
      text: "",
      provider,
      error: err instanceof Error ? err.message : "Consultation failed.",
    };
  }
}

export async function runAgentCommandIntent(
  input: AgentConsultationInput,
): Promise<AgentConsultationResult> {
  if (input.intent === "run") {
    try {
      const verification = await input.api.verify();
      if ("error" in verification) {
        return {
          ok: false,
          text: "",
          error: verification.error,
        };
      }
      const lines = [
        "**Verification results**",
        `- TypeScript: ${verification.typecheck?.ok ? "passed" : "failed"}`,
        `- Build: ${verification.build?.ok ? "passed" : "failed"}`,
      ];
      if (verification.typecheck?.stdout?.trim()) {
        lines.push("", "TypeScript output:", "```", verification.typecheck.stdout.trim(), "```");
      }
      if (verification.build?.stdout?.trim()) {
        lines.push("", "Build output:", "```", verification.build.stdout.trim(), "```");
      }
      return { ok: true, text: lines.join("\n") };
    } catch (err) {
      return {
        ok: false,
        text: "",
        error: err instanceof Error ? err.message : "Verification failed.",
      };
    }
  }

  const command = extractTerminalCommand(input.prompt);
  if (!command) {
    return {
      ok: false,
      text: "",
      error: "Could not determine which terminal command to run.",
    };
  }
  const allowed = validateAgentCommand(command);
  if (!allowed.ok) {
    return {
      ok: false,
      text: "",
      error: allowed.error,
    };
  }

  try {
    const result = await input.api.terminalExec(input.projectPath, command);
    if ("error" in result) {
      return { ok: false, text: "", error: result.error };
    }
    const stdout = result.stdout?.trim() ?? "";
    const stderr = result.stderr?.trim() ?? "";
    const text = [
      `Ran \`${command}\` (exit ${result.exitCode ?? "?"}).`,
      stdout ? `\n**stdout**\n\`\`\`\n${stdout}\n\`\`\`` : "",
      stderr ? `\n**stderr**\n\`\`\`\n${stderr}\n\`\`\`` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { ok: result.ok, text };
  } catch (err) {
    return {
      ok: false,
      text: "",
      error: err instanceof Error ? err.message : "Terminal command failed.",
    };
  }
}

export function consultationActivityLine(intent: AgentPromptIntent): string {
  return consultationPreviewLine(intent);
}
