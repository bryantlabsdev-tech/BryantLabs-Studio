import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectPromptIntent,
  formatIntentSummary,
  intentFeatureTags,
} from "@/core/fileSelection/intent";
import {
  historyBoostForPath,
  recordFileHistory,
} from "@/core/fileSelection/history";
import { rankSmartFiles } from "@/core/fileSelection/rank";
import { mockProjectScan } from "@/core/repository/testScan";

describe("smart file selection", () => {
  it("detectPromptIntent extracts dashboard and KPI concepts", () => {
    const intent = detectPromptIntent("Add dashboard KPI cards");
    assert.ok(intent.uiElements.includes("cards"));
    assert.ok(intent.uiElements.includes("kpi") || intent.keywords.includes("kpi"));
    assert.ok(
      intent.components.includes("dashboard") ||
        intent.features.includes("dashboard") ||
        intent.keywords.includes("dashboard"),
    );
    assert.ok(formatIntentSummary(intent).toLowerCase().includes("dashboard"));
  });

  it("detectPromptIntent extracts CRM activity timeline concepts", () => {
    const intent = detectPromptIntent("Add activity timeline to CRM");
    assert.ok(intent.businessConcepts.includes("crm"));
    assert.ok(intent.uiElements.includes("timeline") || intent.features.includes("timeline"));
    const tags = intentFeatureTags(intent);
    assert.ok(tags.includes("crm"));
  });

  it("rankSmartFiles prefers dashboard-related paths", () => {
    const scan = mockProjectScan([
      "src/main.tsx",
      "src/App.tsx",
      "src/components/Dashboard.tsx",
      "src/components/DashboardCard.tsx",
    ]);
    const result = rankSmartFiles("Add dashboard KPI cards", scan, { maxFiles: 6 });
    const paths = result.files.map((f) => f.path);
    const dashIdx = paths.indexOf("src/components/Dashboard.tsx");
    const mainIdx = paths.indexOf("src/main.tsx");
    assert.ok(dashIdx >= 0, "Dashboard.tsx should rank");
    if (mainIdx >= 0 && dashIdx >= 0) {
      assert.ok(
        result.files[dashIdx]!.score >= result.files[mainIdx]!.score,
        "Dashboard should score higher than main",
      );
    }
    assert.equal(result.files[0]!.score, 100);
    assert.ok(result.reasoning.length > 0);
  });

  it("recordFileHistory boosts paths on similar prompts", () => {
    recordFileHistory({
      projectPath: "/proj",
      paths: ["src/components/Dashboard.tsx"],
      prompt: "dashboard cards",
      featureTags: ["dashboard", "cards"],
      success: true,
    });
    const boost = historyBoostForPath(
      "src/components/Dashboard.tsx",
      "/proj",
      "add dashboard kpi cards",
    );
    assert.ok(boost.boost > 0);
    assert.ok(boost.reason);
  });
});
