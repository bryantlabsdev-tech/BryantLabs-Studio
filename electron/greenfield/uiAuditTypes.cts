/** Transport types for main-process UI audit (mirror src/core/greenfield/uiAudit/types.ts). */

export interface ControlRect {
  readonly width: number;
  readonly height: number;
  readonly visible: boolean;
  readonly top: number;
  readonly left: number;
  readonly tag: string;
}

export interface GridRegion {
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  readonly cells: readonly { readonly width: number; readonly height: number }[];
  readonly hasRowWrappers: boolean;
}

export interface FormRegion {
  readonly fieldCount: number;
  readonly submitVisible: boolean;
  readonly fields: readonly ControlRect[];
}

export interface TableRegion {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly headerVisible: boolean;
  readonly width: number;
  readonly height: number;
}

export interface ChatRegion {
  readonly messageCount: number;
  readonly inputVisible: boolean;
  readonly threadHeight: number;
}

export interface CalculatorRegion {
  readonly displayVisible: boolean;
  readonly displayHeight: number;
  readonly buttonCount: number;
  readonly buttonsTooSmall: number;
}

export interface UiDomSnapshot {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly controls: readonly ControlRect[];
  readonly grid: GridRegion | null;
  readonly form: FormRegion | null;
  readonly table: TableRegion | null;
  readonly chat: ChatRegion | null;
  readonly calculator: CalculatorRegion | null;
  readonly dashboardPanels: readonly { readonly width: number; readonly height: number }[];
  readonly horizontalOverflow: boolean;
  readonly rootHasContent: boolean;
}

export interface UiAuditSnapshotTransport {
  readonly ok: boolean;
  readonly snapshot: UiDomSnapshot | null;
  readonly error?: string;
}
