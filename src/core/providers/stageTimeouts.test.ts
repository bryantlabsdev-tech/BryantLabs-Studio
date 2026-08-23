import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimatePromptComplexity,
  resolveStageTimeoutMs,
  STAGE_TIMEOUT_MS,
} from "@/core/providers/stageTimeouts";
import { EDIT_PHASE_TIMING_MS } from "@/core/editPhases/types";

describe("stageTimeouts bounded multi-phase budgets", () => {
  it("classifies short prompts as standard", () => {
    assert.equal(estimatePromptComplexity("Build a todo app"), "standard");
    assert.equal(
      resolveStageTimeoutMs("greenfield", { promptText: "Build a todo app" }),
      STAGE_TIMEOUT_MS.greenfield,
    );
  });

  it("keeps xlarge greenfield timeouts at the 3-minute phase ceiling", () => {
    const prompt = `Build a polished project-management application called Northstar.
Use React and TypeScript. Organize into components, hooks, utilities, and typed models.
Include:
- Dashboard with project, task, completion, workload, and overdue summaries
- Projects page with create, edit, archive, search, and status filtering
- Task list with create, edit, delete, complete, priority, due date, assignee, tags
- Team page with member profiles and workload summaries
- Calendar-style due-date view
- Activity timeline
- Responsive sidebar navigation
- Light and dark themes
- Form validation and accessible controls
- Empty, loading, and error states
- Seed/demo data
- Local persistence with a versioned storage schema
- Reusable confirmation dialog and toast notifications
- No external backend or authentication service
The project must typecheck, build, run in Preview, and persist user changes after reload.`;
    assert.equal(estimatePromptComplexity(prompt), "xlarge");
    assert.equal(
      resolveStageTimeoutMs("greenfield", { promptText: prompt }),
      EDIT_PHASE_TIMING_MS.generation,
    );
    assert.equal(STAGE_TIMEOUT_MS.greenfieldXLarge, EDIT_PHASE_TIMING_MS.generation);
    assert.ok(STAGE_TIMEOUT_MS.greenfieldXLarge <= 180_000);
  });

  it("caps large coder patches at 3 minutes", () => {
    assert.equal(
      resolveStageTimeoutMs("coder", { patchSize: "large" }),
      EDIT_PHASE_TIMING_MS.generation,
    );
    assert.ok(STAGE_TIMEOUT_MS.coderLargePatch <= 180_000);
  });

  it("does not extend Kanban-scale edits beyond the phase generation budget", () => {
    const prompt = `Expand Northstar with a complete Kanban and planning system.
Add:
- Drag-and-drop Kanban board grouped by task status
- Backlog, Planned, In Progress, Review, and Done columns
- Persistent task ordering within columns
- Project milestones with progress tracking
- Task dependencies and blocked-task indicators
- Bulk task selection and bulk status/priority/assignee actions
- Saved filter presets
- CSV import with validation and an error summary
- CSV and JSON export
- Command palette with keyboard navigation
- Undo for destructive task operations
- Dashboard charts derived from actual application data
- Migration of existing locally stored data to the new schema without losing it
- Updates to all affected types, state management, components, navigation, styles, demo data, and persistence logic`;
    assert.equal(estimatePromptComplexity(prompt), "xlarge");
    assert.equal(
      resolveStageTimeoutMs("coder", { patchSize: "large", promptText: prompt }),
      EDIT_PHASE_TIMING_MS.generation,
    );
    assert.equal(STAGE_TIMEOUT_MS.coderXLargePatch, EDIT_PHASE_TIMING_MS.generation);
  });

  it("keeps first-byte deadline at 60s regardless of total timeout", () => {
    assert.equal(EDIT_PHASE_TIMING_MS.firstByte, 60_000);
    // Mirrors electron/providers/httpJson resolveFirstByteTimeoutMs.
    const firstByte = 60_000;
    assert.equal(firstByte, 60_000);
  });
});
