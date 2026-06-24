import type { UiDomSnapshot } from "@/core/greenfield/uiAudit/types";

const MIN_CONTROL_PX = 28;

/** Unified DOM collection script for all layout categories (generated app #root only). */
export function buildDomAuditScript(): string {
  return `(() => {
    function isVisible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
    }
    function rect(el) {
      const r = el.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        visible: r.width >= ${MIN_CONTROL_PX} && r.height >= ${MIN_CONTROL_PX},
        top: r.top,
        left: r.left,
        tag: el.tagName.toLowerCase(),
      };
    }
    const appRoot =
      document.querySelector("#root") ||
      document.querySelector("main") ||
      document.querySelector(".app-container") ||
      document.body;
    function qs(sel) {
      return appRoot.querySelector(sel);
    }
    function qsa(sel) {
      return [...appRoot.querySelectorAll(sel)];
    }
    const controls = qsa("button, select, input, textarea, a[role=button]")
      .filter(isVisible)
      .map(rect);
    const board =
      qs(".sudoku-board, .game-board, [role=grid], .grid-board") ||
      qs('[aria-label*="sudoku" i], [aria-label*="game board" i]');
    let cells = [];
    if (board) {
      cells = [...board.querySelectorAll(".cell, [role=gridcell]")].filter(isVisible);
      if (cells.length === 0) {
        cells = [...board.querySelectorAll(".cell-row .cell, .cell-row > *")].filter(isVisible);
      }
    }
    const boardRect = board ? board.getBoundingClientRect() : null;
    const grid = boardRect ? {
      width: boardRect.width,
      height: boardRect.height,
      cellCount: cells.length,
      cells: cells.map((c) => {
        const r = c.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }),
      hasRowWrappers: board.querySelector(".cell-row") !== null,
    } : null;
    const formEl = qs("form");
    const form = formEl ? {
      fieldCount: formEl.querySelectorAll("input, select, textarea").length,
      submitVisible: [...formEl.querySelectorAll('button, input[type=submit]')].some(isVisible),
      fields: [...formEl.querySelectorAll("input, select, textarea")].filter(isVisible).map(rect),
    } : null;
    const tableEl = qs("table");
    const table = tableEl ? (() => {
      const r = tableEl.getBoundingClientRect();
      const rows = tableEl.querySelectorAll("tr");
      const cols = rows[0] ? rows[0].querySelectorAll("th, td").length : 0;
      const header = tableEl.querySelector("thead, th");
      return {
        rowCount: rows.length,
        columnCount: cols,
        headerVisible: header ? isVisible(header) : false,
        width: r.width,
        height: r.height,
      };
    })() : null;
    const chatMessages = qsa(
      ".chat-message, .chat-messages > *, .messages > *, [data-chat-message], [data-message][data-role]",
    );
    const chatInput = qs(
      '.chat-input, .chat-composer textarea, .chat-composer input, [data-chat-input], textarea.chat-input, input.chat-input',
    );
    const chatThread = qs(".messages, .chat-thread, .chat-messages, .conversation");
    const chat = chatMessages.length > 0 || chatInput || chatThread ? {
      messageCount: chatMessages.length,
      inputVisible: chatInput ? isVisible(chatInput) : false,
      threadHeight: (chatThread || appRoot).getBoundingClientRect().height,
    } : null;
    const display = qs(
      '.display, .calculator-display, [aria-label*="display" i], .calc-display',
    );
    const calcButtons = qsa(
      ".calculator button, .number-pad button, .keypad button, .calc-btn",
    );
    const calculator = display || calcButtons.length >= 4 ? {
      displayVisible: display ? isVisible(display) : false,
      displayHeight: display ? display.getBoundingClientRect().height : 0,
      buttonCount: calcButtons.length,
      buttonsTooSmall: [...calcButtons].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width < ${MIN_CONTROL_PX} || r.height < ${MIN_CONTROL_PX};
      }).length,
    } : null;
    const dashboardPanels = qsa(
      ".panel, .card, .widget, .dashboard-panel, .panel-card, .kanban-column, .board-column, aside, nav, [role=complementary], main > section, main [class*='grid'] > div, [class*='rounded-lg'][class*='border']",
    )
      .filter(isVisible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })
      .filter((p) => p.width >= 60 && p.height >= 32);
    const horizontalOverflow = appRoot.scrollWidth > window.innerWidth + 4;
    const rootEl = document.querySelector("#root");
    const rootHasContent = rootEl
      ? ((rootEl.textContent?.trim().length ?? 0) > 0 ||
          rootEl.querySelector("main, h1, table, .panel-card, aside") != null)
      : appRoot
        ? (appRoot.textContent?.trim().length ?? 0) > 0
        : false;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      controls,
      grid,
      form,
      table,
      chat,
      calculator,
      dashboardPanels,
      horizontalOverflow,
      rootHasContent,
    };
  })()`;
}

export type { UiDomSnapshot };
