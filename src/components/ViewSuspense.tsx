import { Suspense, type ReactNode } from "react";

export function ViewSuspense({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <p className="plan__muted view-suspense view-suspense--loading" role="status">
          Loading…
        </p>
      }
    >
      <div className="view-suspense">{children}</div>
    </Suspense>
  );
}
