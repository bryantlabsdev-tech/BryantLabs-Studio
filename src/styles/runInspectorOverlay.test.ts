import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const stylesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const agentConversationCss = readFileSync(
  path.join(stylesRoot, "agent-conversation.css"),
  "utf8",
);
const runInspectorCss = readFileSync(path.join(stylesRoot, "run-inspector.css"), "utf8");

function extractRuleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{`, "m"));
  assert.ok(match?.index !== undefined, `missing selector: ${selector}`);
  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const brace = css.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed rule for ${selector}`);
}

describe("run inspector overlay opacity", () => {
  it("uses a dark high-opacity diagnostic backdrop", () => {
    const backdrop = extractRuleBlock(agentConversationCss, ".diagnostic-modal__backdrop");
    assert.match(backdrop, /background:\s*rgba\(0,\s*0,\s*0,\s*0\.92\)/);
    assert.doesNotMatch(backdrop, /backdrop-filter/);
    assert.doesNotMatch(backdrop, /color-mix\([^)]*transparent/);
  });

  it("uses opaque theme surfaces on diagnostic modal shell", () => {
    const modal = extractRuleBlock(agentConversationCss, ".diagnostic-modal");
    assert.match(modal, /background:\s*var\(--bg-surface-1/);
    assert.match(modal, /opacity:\s*1/);
  });

  it("uses opaque inspector surfaces for trace and checklist panels", () => {
    const traceEvent = extractRuleBlock(runInspectorCss, ".run-inspector__trace-event");
    assert.match(traceEvent, /background:\s*var\(--inspector-row-odd\)/);
    assert.doesNotMatch(traceEvent, /rgba\(/);

    const checklist = extractRuleBlock(runInspectorCss, ".run-inspector__checklist-item");
    assert.match(checklist, /background:\s*var\(--inspector-surface-raised\)/);
    assert.doesNotMatch(checklist, /rgba\(/);
  });

  it("uses alternating opaque activity rows", () => {
    assert.match(
      runInspectorCss,
      /\.run-inspector__timeline > \.run-inspector__timeline-item:nth-child\(even\)/,
    );
    assert.match(
      runInspectorCss,
      /\.run-inspector__trace-events > \.run-inspector__trace-event:nth-child\(odd\)/,
    );
  });
});
