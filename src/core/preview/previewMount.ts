export type PreviewFrameLoadState = "idle" | "loading" | "loaded" | "failed";

export function shouldMountPreviewFrame(input: {
  readonly frameSrc: string | null;
  readonly frameState: PreviewFrameLoadState;
  readonly httpReady: boolean;
  readonly probing: boolean;
  readonly studioProcessRunning: boolean;
  readonly probeFailed: boolean;
}): boolean {
  if (!input.frameSrc) return false;
  if (input.frameState === "failed") return false;
  if (input.httpReady || input.studioProcessRunning) return true;
  // First probe can lag behind a live server. Mount the frame so Preview is not
  // stuck on "Checking preview server" while localhost is already serving.
  if (input.probing && !input.probeFailed) return true;
  return false;
}
