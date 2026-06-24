import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalContextModule,
  detectMissingContextImports,
  repairMissingContextModule,
} from "@/core/typescript/missingContextRepair";

describe("missingContextRepair", () => {
  it("detects missing DataProvider imports from App.tsx", () => {
    const app = `import { DataProvider } from "./contexts/DataProvider";\nexport default function App(){return null}\n`;
    const detected = detectMissingContextImports(app);
    assert.ok(detected);
    assert.equal(detected!.relFile, "src/contexts/DataProvider.tsx");
  });

  it("builds a minimal provider and hook module", () => {
    const module = buildMinimalContextModule(["DataProvider", "useData"]);
    assert.match(module, /export function DataProvider/);
    assert.match(module, /export function useData/);
    assert.match(module, /localStorage/);
  });

  it("returns a repair when context module is absent", () => {
    const app = `import { DataProvider } from "./contexts/DataProvider";\n`;
    const repair = repairMissingContextModule(app, new Set(["src/App.tsx"]));
    assert.ok(repair);
    assert.equal(repair!.relPath, "src/contexts/DataProvider.tsx");
  });
});
