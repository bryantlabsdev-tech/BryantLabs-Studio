import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly icon?: ReactNode;
  readonly branded?: boolean;
  readonly action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  branded = false,
  action,
}: EmptyStateProps) {
  const resolvedIcon =
    icon ?? (branded ? <BrandLogo size={40} className="empty-state__brand-logo" /> : null);

  return (
    <div className="empty-state">
      {resolvedIcon ? <div className="empty-state__icon">{resolvedIcon}</div> : null}
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__description">{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
