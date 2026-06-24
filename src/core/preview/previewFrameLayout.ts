/** Measure and apply explicit pixel sizing for preview iframe / Electron webview. */

export interface PreviewFrameLayoutTargets {
  readonly container: HTMLElement;
  readonly frame: HTMLElement;
  readonly main?: HTMLElement | null;
}

export interface PreviewFrameLayoutSize {
  readonly width: number;
  readonly height: number;
}

export interface PreviewHeightChainRow {
  readonly label: string;
  readonly className: string;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly offsetHeight: number;
  readonly computedHeight: string;
  readonly computedMinHeight: string;
  readonly display: string;
  readonly flex: string;
  readonly overflow: string;
  readonly boundingHeight: number;
}

const OBSERVED_CHAIN_SELECTORS: readonly { label: string; selector: string }[] = [
  { label: "center workbench panel", selector: ".panel.panel--center" },
  { label: "center panel body", selector: ".center-panel__body" },
  { label: "view suspense wrapper", selector: ".view-suspense" },
  { label: "preview tab root", selector: ".preview-view" },
  { label: "preview toolbar", selector: ".preview-toolbar" },
  { label: "preview body", selector: ".preview-view__main" },
  { label: "preview frame container", selector: ".preview-frame-container" },
];

function readChainRow(label: string, el: HTMLElement): PreviewHeightChainRow {
  const style = getComputedStyle(el);
  return {
    label,
    className: el.className || el.tagName.toLowerCase(),
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    offsetHeight: el.offsetHeight,
    computedHeight: style.height,
    computedMinHeight: style.minHeight,
    display: style.display,
    flex: `${style.flexGrow} ${style.flexShrink} ${style.flexBasis}`,
    overflow: `${style.overflowX}/${style.overflowY}`,
    boundingHeight: Math.round(el.getBoundingClientRect().height),
  };
}

export function collectPreviewHeightChain(input: {
  readonly container: HTMLElement;
  readonly frame: HTMLElement | null;
  readonly previewRoot?: HTMLElement | null;
  readonly toolbar?: HTMLElement | null;
  readonly main?: HTMLElement | null;
}): PreviewHeightChainRow[] {
  const rows: PreviewHeightChainRow[] = [];
  const root =
    input.previewRoot ?? input.container.closest<HTMLElement>(".preview-view");

  for (const { label, selector } of OBSERVED_CHAIN_SELECTORS) {
    const el =
      selector === ".preview-view"
        ? root
        : selector === ".preview-toolbar"
          ? input.toolbar ?? root?.querySelector<HTMLElement>(selector) ?? null
          : selector === ".preview-view__main"
            ? input.main ?? root?.querySelector<HTMLElement>(selector) ?? null
            : selector === ".preview-frame-container"
              ? input.container
              : root?.closest<HTMLElement>(selector) ??
                root?.querySelector<HTMLElement>(selector) ??
                null;
    if (el) rows.push(readChainRow(label, el));
  }

  if (input.frame) {
    rows.push(
      readChainRow(
        input.frame.tagName.toLowerCase() === "webview" ? "webview" : "iframe",
        input.frame,
      ),
    );
  }

  return rows;
}

export function logPreviewHeightChain(rows: readonly PreviewHeightChainRow[]): void {
  if (!import.meta.env.DEV) return;
  console.group("[preview height chain]");
  console.table(
    rows.map((row) => ({
      label: row.label,
      className: row.className,
      clientH: row.clientHeight,
      scrollH: row.scrollHeight,
      offsetH: row.offsetHeight,
      computedH: row.computedHeight,
      minH: row.computedMinHeight,
      display: row.display,
      flex: row.flex,
      overflow: row.overflow,
      rectH: row.boundingHeight,
    })),
  );
  const frame = rows.find((row) => row.label === "webview" || row.label === "iframe");
  const container = rows.find((row) => row.label === "preview frame container");
  const body = rows.find((row) => row.label === "preview body");
  if (frame && container && frame.clientHeight < container.clientHeight - 24) {
    console.warn(
      `[preview layout] ${frame.label} is ${frame.clientHeight}px inside ${container.clientHeight}px container — explicit pixel sizing required.`,
    );
  }
  if (body && container && container.clientHeight < body.clientHeight - 8) {
    console.warn(
      `[preview layout] frame container is ${container.clientHeight}px inside ${body.clientHeight}px preview body.`,
    );
  }
  console.groupEnd();
}

export function measurePreviewFrameLayout(
  targets: PreviewFrameLayoutTargets,
): PreviewFrameLayoutSize | null {
  const main =
    targets.main ??
    targets.container.closest<HTMLElement>(".preview-view__main") ??
    targets.container.parentElement;
  const basis = main ?? targets.container;
  const width = Math.floor(targets.container.clientWidth);
  const height = Math.floor(basis.getBoundingClientRect().height);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

export function applyPreviewFrameLayout(
  targets: PreviewFrameLayoutTargets,
  size: PreviewFrameLayoutSize,
): void {
  const { container, frame } = targets;
  const isWebview = frame.tagName.toLowerCase() === "webview";

  container.style.flex = "1 1 0";
  container.style.minHeight = "0";
  container.style.width = "100%";
  container.style.height = `${size.height}px`;
  container.style.maxHeight = `${size.height}px`;
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.boxSizing = "border-box";

  frame.style.width = `${size.width}px`;
  frame.style.height = `${size.height}px`;
  frame.style.maxWidth = `${size.width}px`;
  frame.style.maxHeight = `${size.height}px`;
  frame.style.minWidth = `${size.width}px`;
  frame.style.minHeight = `${size.height}px`;
  frame.style.border = "0";
  frame.style.margin = "0";
  frame.style.padding = "0";
  frame.style.boxSizing = "border-box";
  frame.style.flex = "none";

  // Electron webview uses display:flex internally; block breaks guest sizing (~150px strip).
  frame.style.display = isWebview ? "inline-flex" : "block";
}

export function clearPreviewFrameLayout(targets: PreviewFrameLayoutTargets): void {
  const { container, frame } = targets;
  for (const el of [container, frame]) {
    el.style.removeProperty("height");
    el.style.removeProperty("max-height");
    el.style.removeProperty("min-height");
    el.style.removeProperty("width");
    el.style.removeProperty("max-width");
    el.style.removeProperty("min-width");
    el.style.removeProperty("flex");
    el.style.removeProperty("position");
    el.style.removeProperty("overflow");
    el.style.removeProperty("display");
    el.style.removeProperty("box-sizing");
    el.style.removeProperty("margin");
    el.style.removeProperty("padding");
    el.style.removeProperty("border");
  }
}
