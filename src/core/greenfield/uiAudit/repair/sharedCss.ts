export const USABLE_CONTROLS_CSS = `
button,
input,
select,
textarea,
.btn {
  min-width: 44px;
  min-height: 44px;
  font-size: clamp(0.95rem, 2.5vw, 1.1rem);
}

input[type="submit"],
button[type="submit"],
.btn.primary {
  min-height: 44px;
  padding: 0.5rem 1rem;
}
`;

export function appendCssBlock(cssSource: string, block: string, marker: string): string {
  if (cssSource.includes(marker)) return cssSource;
  return `${cssSource.trim()}\n\n/* ${marker} */\n${block.trim()}\n`;
}

export function ensureResponsiveRoot(cssSource: string): string {
  if (/overflow-x:\s*hidden/.test(cssSource)) return cssSource;
  const block = `body {
  overflow-x: hidden;
}

#root,
.app-container,
main {
  max-width: 100%;
  box-sizing: border-box;
}`;
  return appendCssBlock(cssSource, block, "ui-audit:responsive-root");
}
