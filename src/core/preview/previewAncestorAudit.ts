/** Walk from preview frame up to app root and measure layout constraints. */

export interface PreviewAncestorRow {
  readonly depth: number;
  readonly selector: string;
  readonly tag: string;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly offsetHeight: number;
  readonly computedHeight: string;
  readonly computedMinHeight: string;
  readonly computedMaxHeight: string;
  readonly overflow: string;
  readonly display: string;
  readonly flex: string;
  readonly position: string;
}

export interface PreviewAncestorAudit {
  readonly rows: readonly PreviewAncestorRow[];
  readonly collapseAt: PreviewAncestorRow | null;
  readonly collapseParent: PreviewAncestorRow | null;
  readonly collapseReason: string;
}

function describeElement(el: HTMLElement): string {
  const id = el.id ? `#${el.id}` : "";
  const classes = [...el.classList].filter(Boolean).slice(0, 4).join(".");
  return `${el.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ""}`;
}

function readRow(el: HTMLElement, depth: number): PreviewAncestorRow {
  const s = getComputedStyle(el);
  return {
    depth,
    selector: describeElement(el),
    tag: el.tagName.toLowerCase(),
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    offsetHeight: el.offsetHeight,
    computedHeight: s.height,
    computedMinHeight: s.minHeight,
    computedMaxHeight: s.maxHeight,
    overflow: `${s.overflowX} / ${s.overflowY}`,
    display: s.display,
    flex: `${s.flexGrow} ${s.flexShrink} ${s.flexBasis}`,
    position: s.position,
  };
}

/** Frame → parents until `.app`. */
export function auditPreviewAncestors(
  frame: HTMLElement | null,
): PreviewAncestorAudit {
  if (!frame) {
    return {
      rows: [],
      collapseAt: null,
      collapseParent: null,
      collapseReason: "Preview frame not mounted.",
    };
  }

  const rows: PreviewAncestorRow[] = [];
  let node: HTMLElement | null = frame;
  let depth = 0;

  while (node) {
    rows.push(readRow(node, depth));
    if (node.classList.contains("app")) break;
    node = node.parentElement;
    depth += 1;
    if (depth > 24) break;
  }

  let collapseAt: PreviewAncestorRow | null = null;
  let collapseParent: PreviewAncestorRow | null = null;
  let collapseReason = "No major height drop detected along ancestor chain.";

  for (let i = 0; i < rows.length - 1; i++) {
    const child = rows[i];
    const parent = rows[i + 1];
    const gap = parent.clientHeight - child.clientHeight;
    if (
      parent.clientHeight >= 180 &&
      gap > 64 &&
      child.clientHeight < parent.clientHeight * 0.55
    ) {
      collapseAt = child;
      collapseParent = parent;
      collapseReason = `${child.selector} is ${child.clientHeight}px tall inside ${parent.selector} (${parent.clientHeight}px) — height collapses here (Δ${gap}px). Computed: height=${child.computedHeight}, flex=${child.flex}, overflow=${child.overflow}.`;
      break;
    }
  }

  if (
    !collapseAt &&
    rows[0] &&
    rows[0].tag === "webview" &&
    rows.length > 1
  ) {
    const container = rows.find((r) =>
      r.selector.includes("preview-frame-container"),
    );
    if (
      container &&
      rows[0].clientHeight < container.clientHeight - 48 &&
      container.clientHeight >= 180
    ) {
      collapseAt = rows[0];
      collapseParent = container;
      collapseReason = `webview (${rows[0].clientHeight}px) is shorter than ${container.selector} (${container.clientHeight}px) — Electron webview needs explicit pixel height and display:inline-flex (not display:block).`;
    }
  }

  return { rows, collapseAt, collapseParent, collapseReason };
}
