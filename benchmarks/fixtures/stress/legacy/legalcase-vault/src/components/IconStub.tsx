import type { FC, SVGProps } from "react";
type IconStubProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
};
const IconStub: FC<IconStubProps> = () => (
  <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />
);
export const FiAlertTriangle = IconStub;
export const FiBriefcase = IconStub;
export const FiCalendar = IconStub;
export const FiCamera = IconStub;
export const FiDownload = IconStub;
export const FiFile = IconStub;
export const FiFileText = IconStub;
export const FiFilter = IconStub;
export const FiMic = IconStub;
export const FiPlayCircle = IconStub;
export const FiPlus = IconStub;
export const FiTag = IconStub;
export const FiUser = IconStub;
export const FiVideo = IconStub;
