import type { FC, SVGProps } from "react";
type IconStubProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
};
const IconStub: FC<IconStubProps> = () => (
  <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
);
export const BarChart3 = IconStub;
export const Calendar = IconStub;
export const Fuel = IconStub;
export const PlusCircle = IconStub;
export const Search = IconStub;
export const Truck = IconStub;
export const UserCheck = IconStub;
export const Users = IconStub;
export const Wrench = IconStub;
