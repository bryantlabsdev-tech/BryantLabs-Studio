import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildApplyPlanBatchPatchPrompt,
  buildApplyPlanOutputContract,
} from "@/core/planApply/applyPlanPrompt";
import { simulateApplyPlanBatchResponses } from "@/core/planApply/applyPlanBatchSimulate";

const TARGETS = ["src/App.tsx", "src/index.css"] as const;

const GEMINI_PROSE =
  "I'll refine the calculator UI with premium spacing, typography, and button styles in App.tsx and index.css.";

const VALID_APP = `export default function App() { return <div className="premium" />; }`;
const VALID_CSS = `.premium { color: gold; }`;

function shortBlocks(): string {
  return [
    `@@FILE:src/App.tsx\n${VALID_APP}\n@@END`,
    `@@FILE:src/index.css\n${VALID_CSS}\n@@END`,
  ].join("\n\n");
}

describe("Apply Plan prompts", () => {
  it("places the output contract at the top and bottom", () => {
    const prompt = buildApplyPlanBatchPatchPrompt({
      userPrompt: "Make calculator UI premium",
      planSummary: "Polish UI",
      files: [
        { path: "src/App.tsx", content: "export default function App() {}" },
        { path: "src/index.css", content: "body {}" },
      ],
      mode: "standard",
    });

    const contract = buildApplyPlanOutputContract(TARGETS);
    assert.ok(prompt.startsWith(contract.split("\n")[0]!));
    assert.ok(prompt.endsWith(contract));
    assert.equal((prompt.match(/RETURN ONLY FULL UPDATED FILES\./g) ?? []).length, 2);
    assert.ok(prompt.includes("@@FILE:src/App.tsx"));
    assert.ok(prompt.includes("@@FILE:src/index.css"));
    assert.ok(!prompt.includes("package.json"));
  });

  it("repair prompt includes prior model output and original files", () => {
    const prompt = buildApplyPlanBatchPatchPrompt({
      userPrompt: "Make calculator UI premium",
      planSummary: "Polish UI",
      files: [
        { path: "src/App.tsx", content: "before app" },
        { path: "src/index.css", content: "before css" },
      ],
      mode: "repair",
      previousModelOutput: GEMINI_PROSE,
    });

    assert.ok(prompt.includes("--- MODEL OUTPUT BEGIN ---"));
    assert.ok(prompt.includes(GEMINI_PROSE));
    assert.ok(prompt.includes("before app"));
    assert.ok(prompt.includes("Convert the invalid model response"));
  });
});

describe("Apply Plan Gemini prose → repair → success", () => {
  it("fails first parse, runs repair, then accepts @@FILE blocks", () => {
    const { final, repairAttempted, attempts } = simulateApplyPlanBatchResponses(
      [GEMINI_PROSE, shortBlocks()],
      TARGETS,
    );

    assert.equal(repairAttempted, true);
    assert.equal(attempts, 2);
    assert.equal(final.ok, true);
    assert.equal(final.files.get("src/App.tsx"), VALID_APP);
    assert.equal(final.files.get("src/index.css"), VALID_CSS);
  });
});
