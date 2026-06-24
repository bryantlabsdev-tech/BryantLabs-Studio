import type { FC, SVGProps } from "react";
type IconStubProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
};
const IconStub: FC<IconStubProps> = () => (
  <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
);
export const AlertTriangle = IconStub;
export const ArrowRightLeft = IconStub;
export const BarChart3 = IconStub;
export const Bell = IconStub;
export const Building = IconStub;
export const Download = IconStub;
export const Home = IconStub;
export const Menu = IconStub;
export const Package = IconStub;
export const PlusCircle = IconStub;
export const Search = IconStub;
export const Settings = IconStub;
export const ShoppingCart = IconStub;
export const Truck = IconStub;
export const User = IconStub;
