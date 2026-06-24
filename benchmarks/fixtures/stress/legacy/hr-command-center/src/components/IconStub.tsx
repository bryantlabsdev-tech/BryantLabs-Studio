import type { FC, SVGProps } from "react";
type IconStubProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
};
const IconStub: FC<IconStubProps> = () => (
  <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
);
export const Briefcase = IconStub;
export const Calendar = IconStub;
export const CalendarDays = IconStub;
export const DollarSign = IconStub;
export const Download = IconStub;
export const FileBarChart2 = IconStub;
export const FileClock = IconStub;
export const FileText = IconStub;
export const PlusCircle = IconStub;
export const Search = IconStub;
export const Trash2 = IconStub;
export const Upload = IconStub;
export const Users = IconStub;
