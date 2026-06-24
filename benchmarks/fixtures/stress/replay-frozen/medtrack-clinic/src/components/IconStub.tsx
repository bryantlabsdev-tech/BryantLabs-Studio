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
export const CreditCard = IconStub;
export const FileText = IconStub;
export const Home = IconStub;
export const Pill = IconStub;
export const Plus = IconStub;
export const Search = IconStub;
export const Stethoscope = IconStub;
export const Users = IconStub;
