// Base type for all entities with common fields
export type BaseEntity = {
  id: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
};

// --- Status Unions ---

export type CaseStatus = "Open" | "In Progress" | "On Hold" | "Closed" | "Dismissed";
export type DeadlineStatus = "Pending" | "Completed" | "Missed";
export type HearingStatus = "Scheduled" | "Completed" | "Postponed" | "Cancelled";

// --- Type Unions ---

export type DocumentType = "Pleading" | "Motion" | "Discovery" | "Contract" | "Correspondence" | "Other" | "Agreement" | "Exhibit";
export type EvidenceType = "Physical" | "Digital" | "Testimonial" | "Documentary";
export type ReportType = "Case Summary" | "Client Activity" | "Billing" | "Custom" | "Client Billing" | "Evidence Log" | "Deadline Calendar";

// --- Domain Entities ---

export type Client = BaseEntity & {
  name: string;
  email: string;
  phone?: string;
  address?: string;

  caseCount?: number;};

export type Case = BaseEntity & {
  caseNumber: string;
  title: string;
  description: string;
  status: CaseStatus;
  openDate: string; // ISO 8601 date string
  closeDate?: string; // ISO 8601 date string
  clientIds: string[];

  clientName?: string;
  dateFiled?: string;};

export type Evidence = BaseEntity & {
  caseId: string;
  name: string;
  description: string;
  type: EvidenceType;
  dateCollected: string; // ISO 8601 date string
  fileUrl?: string;
};

export type Document = BaseEntity & {
  caseId: string;
  name: string;
  type: DocumentType;
  uploadDate: string; // ISO 8601 date string
  fileUrl: string;
};

export type Deadline = BaseEntity & {
  caseId: string;
  title: string;
  description?: string;
  dueDate: string; // ISO 8601 date string
  status: DeadlineStatus;
};

export type Hearing = BaseEntity & {
  caseId: string;
  title: string;
  date: string; // ISO 8601 date string
  location: string;
  judge?: string;
  notes?: string;
  status: HearingStatus;

  caseName?: string;};

export type Note = BaseEntity & {
  caseId: string;
  title: string;
  content: string;

  contentSnippet?: string;
  caseName?: string;
  author?: string;
  tags?: unknown[];};

export type Report = BaseEntity & {
  title: string;
  generatedDate: string; // ISO 8601 date string
  type: ReportType;
  content: string; // Could be JSON or structured text
};

// Auto-patched missing exports
export interface GeneratedReport {
  id: string;
  name: string;
  type?: string;
  generatedAt?: string;
  status?: string;
}
