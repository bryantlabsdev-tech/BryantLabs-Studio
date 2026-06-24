import { primarySearchTerm } from "@/core/agentLoop/keywords";
import { symbolsFromDiagnostics } from "@/core/agentLoop/investigation";
import type {
  AgentActionParams,
  AgentActionType,
  AgentLoopSession,
  AgentThinkResult,
} from "@/core/agentLoop/types";

function think(
  thought: string,
  reason: string,
  action: AgentActionType,
  params: AgentActionParams,
  actionDetail: string,
): AgentThinkResult {
  return { thought, reason, action, params, actionDetail };
}

function nextUnreadHit(session: AgentLoopSession): string | null {
  for (const hit of session.flags.symbolHits) {
    const rel = hit.path.replace(/\\/g, "/");
    if (!session.flags.readPaths.includes(rel)) return rel;
  }
  return null;
}

function decideInvestigation(session: AgentLoopSession): AgentThinkResult {
  const f = session.flags;

  if (f.investigationComplete && f.rootCause) {
    return think(
      "Investigation gathered enough evidence.",
      "Root cause identified; finishing without edits.",
      "complete_task",
      { message: f.rootCause },
      "CompleteTask",
    );
  }

  if (f.lastVerificationOk === null) {
    return think(
      "Need current build and typecheck status.",
      "Investigation starts from verification diagnostics.",
      "run_verification",
      {},
      "RunVerification",
    );
  }

  if (!f.lastVerificationOk && f.searchedTerms.length === 0) {
    const obs = session.observations.join("\n");
    const symbols = symbolsFromDiagnostics(obs);
    const query = symbols[0] ?? "error";
    return think(
      "Verification failed — search the codebase for related symbols.",
      "Error output suggests tracing symbols and files.",
      "search_symbols",
      { query },
      `SearchSymbols("${query}")`,
    );
  }

  if (!f.lastVerificationOk && f.symbolHits.length === 0) {
    const terms = primarySearchTerm(session.goal, f.searchedTerms);
    const query = terms[0] ?? "index";
    return think(
      "Broaden search to locate failing modules.",
      "Symbol search did not match — try file name search.",
      "search_files",
      { query },
      `SearchFiles("${query}")`,
    );
  }

  const unread = nextUnreadHit(session);
  if (unread) {
    return think(
      `Inspect ${unread} for failure context.`,
      "Reading source around reported errors.",
      "read_file",
      { path: unread },
      `ReadFile("${unread}")`,
    );
  }

  if (f.referenceSymbol === null) {
    const obs = session.observations.join("\n");
    const symbols = symbolsFromDiagnostics(obs);
    if (symbols[0]) {
      return think(
        `Trace usages of ${symbols[0]}.`,
        "Find where the broken symbol is imported.",
        "find_references",
        { symbol: symbols[0] },
        `FindReferences("${symbols[0]}")`,
      );
    }
  }

  const summary =
    session.observations.slice(-5).join(" · ") ||
    "Verification failed; see observations.";
  return think(
    "Synthesizing findings from diagnostics and repository exploration.",
    "Investigation mode stops after root-cause summary.",
    "complete_task",
    { message: summary },
    "CompleteTask(investigation)",
  );
}

function decideGoal(session: AgentLoopSession): AgentThinkResult {
  const f = session.flags;
  const terms = primarySearchTerm(session.goal, f.searchedTerms);

  if (f.completionSummary && f.lastVerificationOk === true && f.executionDone) {
    return think(
      "Goal reached with passing verification.",
      "All planned steps executed successfully.",
      "complete_task",
      { message: f.completionSummary },
      "CompleteTask",
    );
  }

  if (terms.length > 0 && f.grepQueries.length === 0 && f.symbolHits.length === 0) {
    const query = terms[0]!;
    return think(
      `Search source for "${query}" occurrences.`,
      "Ripgrep finds exact matches before symbol search.",
      "grep_content",
      { query },
      `Grep("${query}")`,
    );
  }

  if (terms.length > 0 && f.symbolHits.length === 0) {
    const query = terms[0]!;
    return think(
      `Need to locate ${query} in the repository.`,
      "User goal requires finding relevant components first.",
      "search_symbols",
      { query },
      `SearchSymbols("${query}")`,
    );
  }

  const unread = nextUnreadHit(session);
  if (unread && !f.planCreated && f.planAttempts === 0) {
    return think(
      `Review ${unread} before planning edits.`,
      "Understanding existing UI/code structure for the requested change.",
      "read_file",
      { path: unread },
      `ReadFile("${unread}")`,
    );
  }

  if (!f.planCreated) {
    if (f.planAttempts >= 2) {
      const detail =
        f.planLastError ??
        "Planning did not succeed. Configure a provider in Settings, or use AI Plan with a shorter prompt.";
      return think(
        "Planning failed after multiple attempts — stopping retries.",
        detail,
        "request_user_input",
        {
          message: `Planning failed (${f.planAttempts} attempts): ${detail}`,
        },
        "RequestUserInput(plan-failed)",
      );
    }
    return think(
      "Repository context collected — build an AI modification plan.",
      "Dynamic plan will list files to change for the goal.",
      "create_plan",
      {},
      "CreatePlan",
    );
  }

  if (!f.executionDone) {
    return think(
      "Apply coordinated multi-file changes from the plan.",
      "Execution applies patches in dependency order.",
      "modify_files",
      {},
      "ModifyFiles",
    );
  }

  if (f.lastVerificationOk === null) {
    return think(
      "Changes applied — verify build and types.",
      "Completion requires passing verification.",
      "run_verification",
      {},
      "RunVerification",
    );
  }

  if (f.lastVerificationOk === false && f.commandsRun.length === 0) {
    return think(
      "Run build to capture shell diagnostics.",
      "Command output clarifies verification failures.",
      "run_command",
      { command: "npm run build" },
      'RunCommand("npm run build")',
    );
  }

  if (f.lastVerificationOk === false && f.autoFixAttempts < 3) {
    return think(
      "Verification failed after edits — attempt targeted repair.",
      "Auto Fix proposes minimal repairs from diagnostics.",
      "run_auto_fix",
      {},
      "RunAutoFix",
    );
  }

  if (f.lastVerificationOk === false) {
    return think(
      "Verification still failing after repair attempts.",
      "Need human guidance to proceed safely.",
      "request_user_input",
      {
        message:
          "Verification did not pass after automatic repair. Review errors in Verification dock.",
      },
      "RequestUserInput",
    );
  }

  return think(
    "Work complete for the stated goal.",
    "Verification passed and edits were applied.",
    "complete_task",
    {
      message: f.completionSummary ?? "Goal completed successfully.",
    },
    "CompleteTask",
  );
}

/** Reasoning engine: selects the next action from session state (no templates). */
export function decideNextAction(
  session: AgentLoopSession,
): AgentThinkResult {
  if (session.mode === "investigation") {
    return decideInvestigation(session);
  }
  return decideGoal(session);
}

export function isGoalSatisfied(session: AgentLoopSession): boolean {
  if (session.mode === "investigation") {
    return session.flags.investigationComplete;
  }
  return (
    session.flags.executionDone &&
    session.flags.lastVerificationOk === true &&
    session.flags.planCreated
  );
}
