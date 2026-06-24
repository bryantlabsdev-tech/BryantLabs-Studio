// ========== Status Types ==========

export type EventStatus = "Planned" | "Confirmed" | "Completed" | "Cancelled";
export type VenueStatus = "Available" | "Booked" | "Pending";
export type VendorStatus = "Available" | "Contacted" | "Booked";
export type BudgetStatus = "Draft" | "Approved" | "Exceeded";
export type TaskStatus = "To Do" | "In Progress" | "Completed" | "Blocked";
export type GuestRsvpStatus = "Invited" | "Attending" | "Declined" | "Maybe";
export type ReportType = "BudgetSummary" | "GuestList" | "VendorContracts" | "EventTimeline";

// ========== Domain Types ==========

export type Entity = {
  id: string;
  createdAt: string;
  updatedAt:string;
};

export type Event = Entity & {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  venueId?: string;
  status: EventStatus;
};

export type Venue = Entity & {
  name: string;
  address: string;
  capacity: number;
  contactPerson: string;
  contactEmail: string;
  status: VenueStatus;
};

export type Vendor = Entity & {
  name: string;
  serviceType: string; // e.g., "Catering", "Photography", "Music"
  contactPerson: string;
  contactEmail: string;
  status: VendorStatus;
};

export type BudgetItem = {
  id: string;
  description: string;
  category: string;
  estimatedCost: number;
  actualCost: number;
};

export type Budget = Entity & {
  eventId: string;
  totalAmount: number;
  status: BudgetStatus;
  items: BudgetItem[];
};

export type Task = Entity & {
  eventId: string;
  title: string;
  description?: string;
  dueDate: string;
  assigneeId?: string;
  status: TaskStatus;
};

export type Guest = Entity & {
  eventId: string;
  name: string;
  email: string;
  rsvpStatus: GuestRsvpStatus;
};

export type ScheduleItem = {
  id: string;
  startTime: string;
  endTime: string;
  activity: string;
  location: string;

  eventName?: string;
  time?: string;
  status?: string;
};

export type Schedule = Entity & {
  eventId: string;
  items: ScheduleItem[];
};

export type Report = Entity & {
  name: string;
  type: ReportType;
  generatedAt: string;
  data: Record<string, unknown>; // Flexible data structure for the report
};

// Auto-patched missing exports
export type ScheduleItemStatus = "Active" | "Inactive" | "Pending" | "Completed" | "Scheduled" | "Cancelled" | "Postponed" | "Draft" | "Open" | "Closed" | "Approved" | "Rejected" | "Paid" | "Overdue" | "General" | "Other";
