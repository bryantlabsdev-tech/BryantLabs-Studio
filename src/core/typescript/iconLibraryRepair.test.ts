import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  augmentIconStubFromProjectImports,
  buildIconStubModule,
  repairIconLibrariesInProject,
  repairIconRouterSymbolCollisions,
  rewriteIconImportInFile,
} from "@/core/typescript/iconLibraryRepair";
import { evaluateStaticGreenfieldUiGate } from "@/core/greenfield/staticUiSignals";

describe("iconLibraryRepair", () => {
  it("rewrites lucide imports to local stub path", () => {
    const source = `import { Truck, Users } from "lucide-react";\nexport default function X() { return <Truck />; }\n`;
    const result = rewriteIconImportInFile(source, "src/pages/Dashboard.tsx");
    assert.ok(result);
    assert.match(result!.content, /IconStub/);
    assert.doesNotMatch(result!.content, /lucide-react/);
  });

  it("builds stub module for collected symbols", () => {
    const stub = buildIconStubModule(["Truck", "Users"]);
    assert.match(stub, /export const Truck/);
    assert.match(stub, /export const Users/);
  });

  it("repairs icon imports project-wide", () => {
    const files = new Map([
      [
        "src/pages/Dashboard.tsx",
        `import { Calendar } from 'lucide-react';\nexport default function D(){return null;}\n`,
      ],
    ]);
    const result = repairIconLibrariesInProject(files);
    assert.equal(result.changed, true);
    assert.ok(result.files.has("src/components/IconStub.tsx"));
  });

  it("aliases Route icon imports that collide with react-router-dom", () => {
    const source = [
      'import { Route, Link } from "react-router-dom";',
      'import { Route, Home } from "../components/IconStub";',
      "const items = [{ path: '/', icon: Route }];",
      "export function Sidebar() { return <Route />; }",
    ].join("\n");
    const fixed = repairIconRouterSymbolCollisions(source);
    assert.ok(fixed);
    assert.match(fixed!, /RouteIcon.*IconStub/);
    assert.match(fixed!, /from "react-router-dom"/);
    assert.doesNotMatch(fixed!, /NavLinkIcon/);
    assert.match(fixed!, /icon: RouteIcon/);
    assert.match(fixed!, /<RouteIcon/);
  });

  it("adds missing IconStub exports referenced by imports", () => {
    const files = new Map([
      [
        "src/components/IconStub.tsx",
        buildIconStubModule(["Home"]),
      ],
      [
        "src/pages/Alerts.tsx",
        'import { AlertTriangle } from "../components/IconStub";\nexport default function A(){return <AlertTriangle />;}\n',
      ],
    ]);
    const result = augmentIconStubFromProjectImports(files);
    assert.equal(result.changed, true);
    assert.match(result.files.get("src/components/IconStub.tsx")!, /export const AlertTriangle/);
  });
});

describe("staticUiSignals", () => {
  it("passes SaaS shell with routes and css", () => {
    const gate = evaluateStaticGreenfieldUiGate(
      `<Layout><Routes><Route path="/" /></Routes></Layout>`,
      ".app { min-height: 100vh; background: #111; }",
    );
    assert.equal(gate.ok, true);
  });
});
