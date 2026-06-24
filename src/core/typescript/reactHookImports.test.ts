import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectUsedReactHooks,
  removeUnusedDefaultReactImport,
  sanitizeGeneratedReactImports,
} from "@/core/typescript/reactHookImports";
import { removeUnusedImportLine } from "@/core/typescript/unusedCleanup";

describe("reactHookImports", () => {
  it("detects useState in component bodies", () => {
    const source = "const [x, setX] = useState(0);";
    assert.deepEqual(detectUsedReactHooks(source), ["useState"]);
  });

  it("converts unused React default import to hook import", () => {
    const source = [
      "import React from 'react';",
      "const Estimates = () => {",
      "  const [items, setItems] = useState([]);",
      "  return null;",
      "};",
    ].join("\n");
    const next = removeUnusedImportLine(source, "React");
    assert.ok(next);
    assert.match(next!, /import \{ useState \} from ['"]react['"]/);
    assert.doesNotMatch(next!, /\bReact\b/);
  });

  it("keeps named imports when removing React from mixed import", () => {
    const line = "import React, { useState } from 'react';";
    const next = removeUnusedDefaultReactImport("", "React", line);
    assert.equal(next, 'import { useState } from \'react\';');
  });

  it("sanitizes default React import plus bare useState", () => {
    const source = [
      "import React from 'react';",
      "import { Plus } from 'lucide-react';",
      "export default function Estimates() {",
      "  const [items, setItems] = useState([]);",
      "  return null;",
      "}",
    ].join("\n");
    const next = sanitizeGeneratedReactImports(source);
    assert.ok(next);
    assert.match(next!, /import \{ useState \} from ['"]react['"]/);
    assert.doesNotMatch(next!, /\bimport React\b/);
  });
});
