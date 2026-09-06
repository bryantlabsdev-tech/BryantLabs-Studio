import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceContext, useWorkspace } from "@/app/workspaceContext";
import type { WorkspaceState } from "@/app/workspace/workspaceState";

function Probe() {
  const ctx = useWorkspace();
  return createElement("span", { "data-project": ctx.project?.path ?? "" });
}

describe("workspaceContext", () => {
  it("throws when useWorkspace is used outside WorkspaceProvider", () => {
    assert.throws(
      () => renderToStaticMarkup(createElement(Probe)),
      /useWorkspace must be used within a WorkspaceProvider/,
    );
  });

  it("reads the shared WorkspaceContext value", () => {
    const value = { project: { path: "/tmp/demo" } } as WorkspaceState;
    const html = renderToStaticMarkup(
      createElement(
        WorkspaceContext.Provider,
        { value },
        createElement(Probe) as ReactNode,
      ),
    );
    assert.match(html, /data-project="\/tmp\/demo"/);
  });
});
