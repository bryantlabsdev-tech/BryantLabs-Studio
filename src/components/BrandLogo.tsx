import { brandingIconForSize } from "@/core/branding";

export interface BrandLogoProps {
  readonly size?: number;
  readonly className?: string;
  readonly title?: string;
}

/**
 * BryantLabs product mark — uses generated PNG assets from assets/branding.
 */
export function BrandLogo({ size = 24, className, title }: BrandLogoProps) {
  return (
    <img
      src={brandingIconForSize(size)}
      width={size}
      height={size}
      alt={title ?? "BryantLabs Studio"}
      className={className}
      draggable={false}
    />
  );
}
