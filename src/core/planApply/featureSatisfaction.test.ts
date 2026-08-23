import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  appTsxHasStatsPanelFeature,
  detectSatisfiedGameplayFeature,
  isStatsPanelFeaturePrompt,
} from "@/core/planApply/featureSatisfaction";

const STATS_PROMPT =
  "Add a stats panel showing elapsed time, mistakes, hints used, and games completed. Persist stats in localStorage.";

describe("featureSatisfaction", () => {
  it("detects stats panel feature prompts", () => {
    assert.equal(isStatsPanelFeaturePrompt(STATS_PROMPT), true);
    assert.equal(isStatsPanelFeaturePrompt("Make the header blue"), false);
  });

  it("recognizes stats panel already present in A30 App.tsx", () => {
    const appPath = resolve(
      "/Users/ferrisb/Desktop/studiotest/A30/src/App.tsx",
    );
    let appTsx = "";
    try {
      appTsx = readFileSync(appPath, "utf8");
    } catch {
      appTsx = [
        "const STATS_KEY = 'sudoku-stats';",
        "function loadStats() { localStorage.getItem(STATS_KEY); }",
        "const [mistakes, setMistakes] = useState(0);",
        "const [hintsUsed, setHintsUsed] = useState(0);",
        "const [elapsedTime, setElapsedTime] = useState(0);",
        "gamesCompleted",
        "formatTime(elapsedTime)",
        '<div className="stats-panel">',
      ].join("\n");
    }
    assert.equal(appTsxHasStatsPanelFeature(appTsx), true);
    const satisfied = detectSatisfiedGameplayFeature(STATS_PROMPT, {
      "src/App.tsx": appTsx,
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
