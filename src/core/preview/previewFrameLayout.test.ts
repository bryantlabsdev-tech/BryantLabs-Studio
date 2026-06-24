import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPreviewFrameLayout,
  clearPreviewFrameLayout,
  measurePreviewFrameLayout,
} from "@/core/preview/previewFrameLayout";

type MockStyle = Record<string, string> & {
  removeProperty: (name: string) => void;
};

function createMockStyle(): MockStyle {
  const bag: Record<string, string> = {};
  return Object.assign(bag, {
    removeProperty(name: string) {
      delete bag[name];
    },
  });
}

interface MockElement {
  readonly tagName: string;
  readonly className: string;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly style: MockStyle;
  closest(): HTMLElement | null;
  parentElement: HTMLElement | null;
  getBoundingClientRect(): DOMRect;
}

function mockElement(tag: string, size: { width: number; height: number }): MockElement {
  const style = createMockStyle();
  return {
    tagName: tag.toUpperCase(),
    className: "preview-frame",
    clientWidth: size.width,
    clientHeight: size.height,
    style,
    closest: () => null,
    parentElement: null,
    getBoundingClientRect: () => ({
      width: size.width,
      height: size.height,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      toJSON() {
        return {};
      },
    }),
  };
}

describe("previewFrameLayout", () => {
  it("measures container from preview body height", () => {
    const container = mockElement("div", { width: 800, height: 0 });
    const main = mockElement("div", { width: 800, height: 640 });
    const size = measurePreviewFrameLayout({
      container: container as unknown as HTMLElement,
      frame: mockElement("webview", { width: 800, height: 150 }) as unknown as HTMLElement,
      main: main as unknown as HTMLElement,
    });
    assert.deepEqual(size, { width: 800, height: 640 });
  });

  it("applies inline-flex for webview and block for iframe", () => {
    const container = mockElement("div", { width: 900, height: 600 });
    const webview = mockElement("webview", { width: 900, height: 150 });
    applyPreviewFrameLayout(
      {
        container: container as unknown as HTMLElement,
        frame: webview as unknown as HTMLElement,
      },
      { width: 900, height: 600 },
    );
    assert.equal(webview.style.display, "inline-flex");
    assert.equal(webview.style.height, "600px");

    const iframe = mockElement("iframe", { width: 900, height: 150 });
    const container2 = mockElement("div", { width: 900, height: 600 });
    applyPreviewFrameLayout(
      {
        container: container2 as unknown as HTMLElement,
        frame: iframe as unknown as HTMLElement,
      },
      { width: 900, height: 600 },
    );
    assert.equal(iframe.style.display, "block");
    assert.equal(iframe.style.height, "600px");
  });

  it("clears inline layout styles on teardown", () => {
    const container = mockElement("div", { width: 400, height: 300 });
    const frame = mockElement("webview", { width: 400, height: 300 });
    applyPreviewFrameLayout(
      {
        container: container as unknown as HTMLElement,
        frame: frame as unknown as HTMLElement,
      },
      { width: 400, height: 300 },
    );
    clearPreviewFrameLayout({
      container: container as unknown as HTMLElement,
      frame: frame as unknown as HTMLElement,
    });
    assert.equal(frame.style.height ?? "", "");
    assert.equal(container.style.height ?? "", "");
  });
});
