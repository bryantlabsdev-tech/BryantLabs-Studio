import { cancelPipelineSession } from "@/core/pipeline/stateMachine";
import type { PipelineSession } from "@/core/pipeline/types";

/** Promise resolvers for human-in-the-loop pipeline review and repair steps. */
export class PipelineReviewGates {
  private reviewResolver: ((ok: boolean) => void) | null = null;
  private repairResolver: ((ok: boolean) => void) | null = null;

  continueReview(): void {
    this.reviewResolver?.(true);
    this.reviewResolver = null;
  }

  continueRepair(): void {
    this.repairResolver?.(true);
    this.repairResolver = null;
  }

  cancel(
    setSession: (updater: (session: PipelineSession | null) => PipelineSession | null) => void,
    onCancelled: () => void,
  ): void {
    this.reviewResolver?.(false);
    this.reviewResolver = null;
    this.repairResolver?.(false);
    this.repairResolver = null;
    setSession((session) => (session ? cancelPipelineSession(session) : null));
    onCancelled();
  }

  awaitReviewApproval(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.reviewResolver = resolve;
    });
  }

  awaitRepairApproval(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.repairResolver = resolve;
    });
  }
}
