import type { PropsWithChildren, ReactNode } from "react";
import type { PanelMeta } from "@/types";

interface PanelProps {
  meta: PanelMeta;
  className?: string;
  headerAccessory?: ReactNode;
}

/**
 * Generic panel shell: a titled, bordered surface with a scrollable body.
 * Holds no logic — purely presentational layout used by every workspace panel.
 */
export function Panel({
  meta,
  className,
  headerAccessory,
  children,
}: PropsWithChildren<PanelProps>) {
  return (
    <section
      className={`panel${className ? ` ${className}` : ""}`}
      aria-label={meta.title}
    >
      <header className="panel__header">
        <div className="panel__heading">
          <span className="panel__title">{meta.title}</span>
          <span className="panel__subtitle">{meta.subtitle}</span>
        </div>
        {headerAccessory ? (
          <div className="panel__accessory">{headerAccessory}</div>
        ) : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
