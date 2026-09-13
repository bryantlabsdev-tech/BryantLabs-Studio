import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appTsxHasStatsPanelFeature,
  detectSatisfiedGameplayFeature,
  isStatsPanelFeaturePrompt,
} from "@/core/planApply/featureSatisfaction";

const STATS_PROMPT =
  "Add a stats panel showing elapsed time, mistakes, hints used, and games completed. Persist stats in localStorage.";

const COMPLETE_STATS_PANEL_APP = [
  "const STATS_KEY = 'sudoku-stats';",
  "function loadStats() { localStorage.getItem(STATS_KEY); }",
  "const [mistakes, setMistakes] = useState(0);",
  "const [hints, setHints] = useState(0);",
  "const [elapsedTime, setElapsedTime] = useState(0);",
  "const gamesCompleted = 0;",
  "formatTime(elapsedTime)",
  '<div className="stats-panel">',
].join("\n");

describe("featureSatisfaction", () => {
  it("detects stats panel feature prompts", () => {
    assert.equal(isStatsPanelFeaturePrompt(STATS_PROMPT), true);
    assert.equal(isStatsPanelFeaturePrompt("Make the header blue"), false);
  });

  it("recognizes a complete stats panel already present in App.tsx", () => {
    assert.equal(appTsxHasStatsPanelFeature(COMPLETE_STATS_PANEL_APP), true);
    const satisfied = detectSatisfiedGameplayFeature(STATS_PROMPT, {
      "src/App.tsx": COMPLETE_STATS_PANEL_APP,
    });
    assert.ok(satisfied);
    assert.equal(satisfied!.relPath, "src/App.tsx");
  });

  it("does not treat keyword soup without a stats-panel marker as satisfied", () => {
    const soup = [
      "localStorage.setItem('x', '1');",
      "const mistakes = 0;",
      "const hints = 0;",
      "const elapsed = 0;",
      "const gamesCompleted = 1;",
      "formatTime(elapsed)",
    ].join("\n");
    assert.equal(appTsxHasStatsPanelFeature(soup), false);
  });

  it("returns null when stats panel is not implemented", () => {
    const minimalApp = "export default function App() { return <div />; }";
    assert.equal(detectSatisfiedGameplayFeature(STATS_PROMPT, {
      "src/App.tsx": minimalApp,
    }), null);
  });
});
