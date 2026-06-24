import type { FC, SVGProps } from "react";
type IconStubProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
};
const IconStub: FC<IconStubProps> = () => (
  <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
);
export const ArrowDownTrayIcon = IconStub;
export const CalendarDaysIcon = IconStub;
export const ChartBarIcon = IconStub;
export const ClockIcon = IconStub;
export const DocumentChartBarIcon = IconStub;
export const UserPlusIcon = IconStub;
export const UsersIcon = IconStub;
