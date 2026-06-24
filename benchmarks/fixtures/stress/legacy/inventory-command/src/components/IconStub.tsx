import type { FC, SVGProps } from "react";
type IconStubProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
};
const IconStub: FC<IconStubProps> = () => (
  <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
);
export const ArchiveBoxIcon = IconStub;
export const ArrowDownOnSquareIcon = IconStub;
export const CheckCircleIcon = IconStub;
export const DocumentChartBarIcon = IconStub;
export const ExclamationTriangleIcon = IconStub;
export const ShoppingCartIcon = IconStub;
