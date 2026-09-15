import { PORT_RELEASE_MS, TERM_GRACE_MS } from "./processTree.cjs";

export interface QuitLifecycleEvent {
  preventDefault(): void;
}

export interface QuitTeardownDeps {
  stopPreviewAsync: () => Promise<void>;
  destroyAllTerminals: () => void;
  quit: () => void;
  log?: (message: string) => void;
  timeoutMs?: number;
}

/**
 * Hard bound covering SIGTERM grace, SIGKILL wait, tracked port release, and a
 * small margin so a hung preview cannot block Studio shutdown forever.
 */
export const QUIT_TEARDOWN_TIMEOUT_MS =
  TERM_GRACE_MS + Math.min(TERM_GRACE_MS, 150) + PORT_RELEASE_MS + 400;

export function shouldQuitWhenAllWindowsClosed(
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform !== "darwin";
}

function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "error";
}

/**
 * Idempotent quit-path coordinator: await Studio-managed preview teardown,
 * stop terminals, coalesce repeated quit events, and resume quit exactly once.
 */
export function createQuitTeardownCoordinator(deps: QuitTeardownDeps) {
  let teardownStarted = false;
  let allowQuit = false;
  let quitReleased = false;
  let teardownPromise: Promise<void> | null = null;
  const timeoutMs = deps.timeoutMs ?? QUIT_TEARDOWN_TIMEOUT_MS;
  const log = deps.log ?? ((message: string) => console.warn(message));

  async function stopPreviewSafely(): Promise<void> {
    try {
      await deps.stopPreviewAsync();
    } catch (err) {
      log(`[quit-teardown] preview stop failed — ${errorDetail(err)}`);
    }
  }

  function destroyTerminalsSafely(): void {
    try {
      deps.destroyAllTerminals();
    } catch (err) {
      log(`[quit-teardown] terminal cleanup failed — ${errorDetail(err)}`);
    }
  }

  async function runTeardown(): Promise<void> {
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs);
    });
    try {
      await Promise.race([stopPreviewSafely(), timeout]);
      if (timedOut) {
        log("[quit-teardown] cleanup timed out; continuing quit");
      }
    } catch (err) {
      log(`[quit-teardown] cleanup failed — ${errorDetail(err)}`);
    } finally {
      if (timer) clearTimeout(timer);
      destroyTerminalsSafely();
      allowQuit = true;
      if (!quitReleased) {
        quitReleased = true;
        deps.quit();
      }
    }
  }

  function intercept(event: QuitLifecycleEvent): boolean {
    if (allowQuit) return false;
    event.preventDefault();
    if (!teardownStarted) {
      teardownStarted = true;
      teardownPromise = runTeardown();
    }
    return true;
  }

  return {
    intercept,
    isTeardownPending(): boolean {
      return teardownStarted && !allowQuit;
    },
    isQuitAllowed(): boolean {
      return allowQuit;
    },
    whenSettled(): Promise<void> {
      return teardownPromise ?? Promise.resolve();
    },
  };
}
