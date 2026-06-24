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
export const Bell = IconStub;
export const ClipboardList = IconStub;
export const Fuel = IconStub;
export const Globe = IconStub;
export const Home = IconStub;
export const MapPin = IconStub;
export const Package = IconStub;
export const PlusCircle = IconStub;
export const Settings = IconStub;
export const SettingsIcon = IconStub;
export const Truck = IconStub;
export const User = IconStub;
export const UserCircle = IconStub;
export const Wrench = IconStub;
