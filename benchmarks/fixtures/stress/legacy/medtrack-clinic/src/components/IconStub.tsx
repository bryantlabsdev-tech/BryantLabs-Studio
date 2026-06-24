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
export const BarChart3 = IconStub;
export const CalendarClock = IconStub;
export const CheckCircle = IconStub;
export const DollarSign = IconStub;
export const FileText = IconStub;
export const Filter = IconStub;
export const LucideProps = IconStub;
export const Mail = IconStub;
export const Phone = IconStub;
export const Pill = IconStub;
export const PlusCircle = IconStub;
export const Search = IconStub;
export const Stethoscope = IconStub;
export const User = IconStub;
export const Users = IconStub;
