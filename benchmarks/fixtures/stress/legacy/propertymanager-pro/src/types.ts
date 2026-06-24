// Base type for entities with common fields
export type BaseEntity = {
  id: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
};

// Unit Management
export type UnitStatus = 'occupied' | 'vacant' | 'under_maintenance';

export type Unit = BaseEntity & {
  address: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  rentAmount: number;
  status: UnitStatus;
};

// Tenant Management
export type Tenant = BaseEntity & {
  name: string;
  email: string;
  phone: string;
};

// Lease Management
export type LeaseStatus = 'active' | 'expired' | 'terminated' | 'pending';

export type Lease = BaseEntity & {
  unitId: Unit['id'];
  tenantIds: Tenant['id'][];
  startDate: string; // ISO 8601 date string
  endDate: string; // ISO 8601 date string
  monthlyRent: number;
  securityDeposit: number;
  status: LeaseStatus;
};

// Financials
export type RentPaymentStatus = 'paid' | 'late' | 'pending' | 'partial';

export type RentPayment = BaseEntity & {
  leaseId: Lease['id'];
  amount: number;
  paymentDate: string; // ISO 8601 date string
  status: RentPaymentStatus;
};

// Operations
export type MaintenanceRequestStatus = 'new' | 'in_progress' | 'completed' | 'cancelled';

export type MaintenanceRequest = BaseEntity & {
  unitId: Unit['id'];
  tenantId?: Tenant['id'];
  description: string;
  reportedDate: string; // ISO 8601 date string
  status: MaintenanceRequestStatus;
};

export type InspectionStatus = 'scheduled' | 'completed' | 'cancelled' | "canceled";
export type InspectionType = 'move-in' | 'move-out' | 'routine' | 'emergency';

export type Inspection = BaseEntity & {
  unitId: Unit['id'];
  inspectionDate: string; // ISO 8601 date string
  type: InspectionType;
  notes: string;
  status: InspectionStatus;

  unitAddress?: string;
  inspector?: string;};

// Communication
export type NoticeType = 'rent_reminder' | 'late_notice' | 'inspection_notice' | 'eviction' | 'general' | "maintenance_entry" | "late_rent" | "lease_violation";

export type Notice = BaseEntity & {
  recipientId: Unit['id'] | Tenant['id']; // Can be sent to a unit or a specific tenant
  title: string;
  body: string;
  sentDate: string; // ISO 8601 date string
  type: NoticeType;

  tenantName?: string;
  unitAddress?: string;
  status?: string;};

// Reporting
export type ReportType = 'rent_roll' | 'occupancy' | 'maintenance_history' | 'financial_summary';

export type Report = BaseEntity & {
  name: string;
  generatedDate: string; // ISO 8601 date string
  type: ReportType;
  data: unknown; // Data structure depends on the report type
};

// Auto-patched missing exports
export type NoticeStatus = "Active" | "Inactive" | "Pending" | "Completed" | "Scheduled" | "Cancelled" | "Postponed" | "Draft" | "Open" | "Closed" | "Approved" | "Rejected" | "Paid" | "Overdue" | "General" | "Other" | "sent" | "delivered" | "viewed";
