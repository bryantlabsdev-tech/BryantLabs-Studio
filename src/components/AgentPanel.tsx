import { ViewSuspense } from "@/components/ViewSuspense";
import { LazyBuildView } from "@/components/lazyViews";

/**
 * Left Agent chat column — always visible.
 */
export function AgentPanel() {
  return (
    <section className="panel panel--agent" aria-label="Agent">
      <ViewSuspense>
        <LazyBuildView />
      </ViewSuspense>
    </section>
  );
}
