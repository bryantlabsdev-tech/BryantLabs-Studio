/** Distance from bottom (px) treated as "pinned to bottom" for auto-scroll. */
export const AGENT_CHAT_SCROLL_NEAR_BOTTOM_PX = 48;

export function isScrollNearBottom(el: {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}): boolean {
  return (
    el.scrollHeight - el.scrollTop - el.clientHeight <= AGENT_CHAT_SCROLL_NEAR_BOTTOM_PX
  );
}

/** Whether the chat should follow new run output automatically. */
export function shouldAutoScrollAgentChat(opts: {
  readonly runActive: boolean;
  readonly userPausedAutoScroll: boolean;
}): boolean {
  return opts.runActive && !opts.userPausedAutoScroll;
}

/** After a run finishes, scroll once so the final summary stays in view. */
export function shouldScrollOnRunComplete(opts: {
  readonly wasActive: boolean;
  readonly isActive: boolean;
}): boolean {
  return opts.wasActive && !opts.isActive;
}
