import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatchReviewBulkBar } from "@/components/editor/patchReviewBulkBar";

function findButton(
  node: ReactNode,
  label: string,
): { readonly props: { readonly onClick?: () => void; readonly disabled?: boolean } } | null {
  if (node == null || typeof node === "boolean") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as {
    readonly children?: ReactNode;
    readonly onClick?: () => void;
    readonly disabled?: boolean;
  };
  if (node.type === "button" && props.children === label) {
    return { props };
  }
  return findButton(props.children, label);
}

describe("PatchReviewPanel Accept all", () => {
  it("wires Accept all through PatchReviewPanel and invokes onAcceptAll", () => {
    const panelPath = fileURLToPath(
      new URL("./PatchReviewPanel.tsx", import.meta.url),
    );
    const source = readFileSync(panelPath, "utf8");
    assert.match(source, /canAcceptAll=\{review\?\.canAcceptAll \?\? false\}/);
    assert.match(source, /onAcceptAll=\{props\.onAcceptAll\}/);
    assert.match(source, /\.\.\.\(props\.acceptLabel \? \{ acceptLabel: props\.acceptLabel \} : \{\}\)/);

    let clicked = 0;
    const html = renderToStaticMarkup(
      createElement(PatchReviewBulkBar, {
        busy: false,
        canAcceptAll: true,
        onAcceptAll: () => {
          clicked += 1;
        },
        onRejectAll: () => {},
        onRegenerate: () => {},
      }),
    );
    assert.match(html, />Accept all</);
    assert.doesNotMatch(html, /disabled=""/);

    const bar = PatchReviewBulkBar({
      busy: false,
      canAcceptAll: true,
      onAcceptAll: () => {
        clicked += 1;
      },
      onRejectAll: () => {},
      onRegenerate: () => {},
    });
    const accept = findButton(bar, "Accept all");
    assert.ok(accept);
    assert.equal(accept.props.disabled, false);
    accept.props.onClick?.();
    assert.equal(clicked, 1);
  });

  it("does not render or enable Accept all when it cannot be used", () => {
    const hidden = renderToStaticMarkup(
      createElement(PatchReviewBulkBar, {
        busy: true,
        canAcceptAll: false,
        onAcceptAll: () => {
          throw new Error("Accept all must not render");
        },
        onRejectAll: () => {},
        onRegenerate: () => {},
      }),
    );
    assert.doesNotMatch(hidden, />Accept all</);
    assert.equal(
      findButton(
        PatchReviewBulkBar({
          busy: true,
          canAcceptAll: false,
          onAcceptAll: () => {
            throw new Error("Accept all must not render");
          },
          onRejectAll: () => {},
          onRegenerate: () => {},
        }),
        "Accept all",
      ),
      null,
    );

    const disabledHtml = renderToStaticMarkup(
      createElement(PatchReviewBulkBar, {
        busy: true,
        canAcceptAll: true,
        onAcceptAll: () => {
          throw new Error("Accept all must stay disabled");
        },
        onRejectAll: () => {},
        onRegenerate: () => {},
      }),
    );
    assert.match(disabledHtml, /disabled=""/);
    assert.match(disabledHtml, />Accept all</);
  });
});
