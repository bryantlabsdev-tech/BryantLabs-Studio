/** Measure preview layout chain and identify height constraints. */

export interface PreviewLayoutAudit {
  readonly previewRootHeight: number;
  readonly toolbarHeight: number;
  readonly centerPanelHeight: number;
  readonly centerBodyHeight: number;
  readonly availablePreviewHeight: number;
  readonly frameWrapperHeight: number;
  readonly frameHeight: number;
  readonly scrollContainerHeight: number;
  readonly viewportControlsEnabled: boolean;
  readonly deviceMode: string;
  readonly zoomMode: string;
  readonly limitingElement: string;
  readonly limitingReason: string;
  readonly limitingComputedCss: string;
  readonly chain: readonly PreviewLayoutChainRow[];
}

export interface PreviewLayoutChainRow {
  readonly selector: string;
  readonly clientHeight: number;
  readonly offsetHeight: number;
  readonly height: string;
  readonly maxHeight: string;
  readonly minHeight: string;
  readonly flex: string;
  readonly overflow: string;
  readonly position: string;
  readonly transform: string;
}

export function auditPreviewLayout(input: {
  readonly previewRoot: HTMLElement | null;
  readonly toolbar: HTMLElement | null;
  readonly frameWrap: HTMLElement | null;
  readonly frame: HTMLElement | null;
  readonly viewportControlsEnabled: boolean;
  readonly deviceMode?: string;
  readonly zoomMode?: string;
}): PreviewLayoutAudit {
  const previewRootHeight = input.previewRoot?.clientHeight ?? 0;
  const toolbarHeight = input.toolbar?.clientHeight ?? 0;
  const centerPanel =
    input.previewRoot?.closest<HTMLElement>(".panel--center") ?? null;
  const centerBody =
    input.previewRoot?.closest<HTMLElement>(".center-panel__body") ?? null;
  const centerPanelHeight = centerPanel?.clientHeight ?? 0;
  const centerBodyHeight = centerBody?.clientHeight ?? 0;
  const availablePreviewHeight = Math.max(0, previewRootHeight - toolbarHeight);
  const frameWrapperHeight = input.frameWrap?.clientHeight ?? 0;
  const frameHeight = input.frame?.clientHeight ?? 0;
  const scrollContainerHeight = input.frameWrap?.clientHeight ?? 0;

  const chain = buildChain(input.frame ?? input.frameWrap ?? input.previewRoot);

  const { limitingElement, limitingReason, limitingComputedCss } =
    findHeightLimiter({
      availablePreviewHeight,
      frameWrapperHeight,
      frameHeight,
      frameWrap: input.frameWrap,
      frame: input.frame,
      chain,
    });

  return {
    previewRootHeight,
    toolbarHeight,
    centerPanelHeight,
    centerBodyHeight,
    availablePreviewHeight,
    frameWrapperHeight,
    frameHeight,
    scrollContainerHeight,
    viewportControlsEnabled: input.viewportControlsEnabled,
    deviceMode: input.deviceMode ?? "simple (controls off)",
    zoomMode: input.zoomMode ?? "none",
    limitingElement,
    limitingReason,
    limitingComputedCss,
    chain,
  };
}

function elementSelector(el: HTMLElement): string {
  const id = el.id ? `#${el.id}` : "";
  const classes = [...el.classList].slice(0, 3).join(".");
  return `${el.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ""}`;
}

function buildChain(leaf: HTMLElement | null): PreviewLayoutChainRow[] {
  const rows: PreviewLayoutChainRow[] = [];
  let node: HTMLElement | null = leaf;
  while (node && rows.length < 12) {
    const s = getComputedStyle(node);
    rows.push({
      selector: elementSelector(node),
      clientHeight: node.clientHeight,
      offsetHeight: node.offsetHeight,
      height: s.height,
      maxHeight: s.maxHeight,
      minHeight: s.minHeight,
      flex: `${s.flexGrow} ${s.flexShrink} ${s.flexBasis}`,
      overflow: `${s.overflowX}/${s.overflowY}`,
      position: s.position,
      transform: s.transform === "none" ? "none" : s.transform,
    });
    if (node.classList.contains("app")) break;
    node = node.parentElement;
  }
  return rows;
}

function summarizeComputed(el: HTMLElement | null): string {
  if (!el) return "—";
  const s = getComputedStyle(el);
  return [
    `height:${s.height}`,
    `max-height:${s.maxHeight}`,
    `flex:${s.flex}`,
    `overflow:${s.overflow}`,
    `position:${s.position}`,
    `transform:${s.transform}`,
    `display:${s.display}`,
  ].join("; ");
}

function findHeightLimiter(input: {
  readonly availablePreviewHeight: number;
  readonly frameWrapperHeight: number;
  readonly frameHeight: number;
  readonly frameWrap: HTMLElement | null;
  readonly frame: HTMLElement | null;
  readonly chain: readonly PreviewLayoutChainRow[];
}): {
  limitingElement: string;
  limitingReason: string;
  limitingComputedCss: string;
} {
  const slackWrap = input.availablePreviewHeight - input.frameWrapperHeight;
  const slackFrame = input.frameWrapperHeight - input.frameHeight;

  if (
    input.frameWrapperHeight > 120 &&
    input.frameHeight > 0 &&
    slackFrame > 80
  ) {
    const tag =
      input.frame?.tagName.toLowerCase() === "webview" ? "webview" : "iframe";
    const cls = input.frame?.className ? `.${input.frame.className.split(" ")[0]}` : "";
    return {
      limitingElement: `${tag}${cls}`,
      limitingReason: `${tag} is ${input.frameHeight}px tall inside a ${input.frameWrapperHeight}px wrapper (lost ${slackFrame}px). Guest uses intrinsic/default height unless sized in pixels.`,
      limitingComputedCss: summarizeComputed(input.frame),
    };
  }

  if (input.availablePreviewHeight > 120 && slackWrap > 80) {
    return {
      limitingElement: ".preview-frame-wrap",
      limitingReason: `Frame wrapper is ${input.frameWrapperHeight}px but ${input.availablePreviewHeight}px is available below the toolbar (lost ${slackWrap}px).`,
      limitingComputedCss: summarizeComputed(input.frameWrap),
    };
  }

  const previewViewRow = input.chain.find((r) =>
    r.selector.includes("preview-view"),
  );
  const centerBodyRow = input.chain.find((r) =>
    r.selector.includes("center-panel__body"),
  );
  if (
    previewViewRow &&
    centerBodyRow &&
    centerBodyRow.clientHeight > 200 &&
    previewViewRow.clientHeight < centerBodyRow.clientHeight - 40
  ) {
    return {
      limitingElement: ".preview-view",
      limitingReason: `Preview root is ${previewViewRow.clientHeight}px while center body is ${centerBodyRow.clientHeight}px; flex height not propagating.`,
      limitingComputedCss: [
        `height:${previewViewRow.height}`,
        `flex:${previewViewRow.flex}`,
      ].join("; "),
    };
  }

  const weak = input.chain.find(
    (r, i) =>
      i > 0 &&
      r.clientHeight > 0 &&
      r.clientHeight < (input.chain[i - 1]?.clientHeight ?? 0) - 40,
  );
  if (weak) {
    return {
      limitingElement: weak.selector,
      limitingReason: `Height drops to ${weak.clientHeight}px at ${weak.selector} in the ancestor chain.`,
      limitingComputedCss: [
        `height:${weak.height}`,
        `max-height:${weak.maxHeight}`,
        `flex:${weak.flex}`,
        `overflow:${weak.overflow}`,
      ].join("; "),
    };
  }

  return {
    limitingElement: "none detected",
    limitingReason:
      input.frameHeight > 0
        ? "Heights look consistent; if content is clipped, check guest page overflow CSS."
        : "Preview frame not mounted.",
    limitingComputedCss: summarizeComputed(input.frame ?? input.frameWrap),
  };
}
