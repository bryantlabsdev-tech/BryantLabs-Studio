// Domain types and status unions for LegalCase Vault

// Status and Type Unions
export type CaseStatus = 'Open' | 'Closed' | 'Pending' | 'On Hold';
export type DeadlineStatus = 'Pending' | 'Completed' | 'Missed';
export type EvidenceType = 'Document' | 'Photo' | 'Video' | 'Audio' | 'Physical';
export type DocumentType = 'Pleading' | 'Motion' | 'Discovery' | 'Order' | 'Correspondence';
export type ReportType = 'Case Summary' | 'Client Activity' | 'Billing Report' | "";

// Main Entity Types
export type Client = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  dateCreated: string;

  caseCount?: number;};

export type Case = {
  id: string;
  clientId: string;
  caseNumber: string;
  title: string;
  description: string;
  status: CaseStatus;
  dateOpened: string;
  dateClosed?: string;

  clientName?: string;
  dateFiled?: string;};

export type Evidence = {
  id: string;
  caseId: string;
  name: string;
  description: string;
  type: EvidenceType;
  dateCollected: string;
  fileUrl?: string;
};

export type Document = {
  id: string;
  caseId:string;
  name: string;
  type: DocumentType;
  fileUrl: string;
  dateUploaded: string;
};

export type Deadline = {
  id: string;
  caseId: string;
  title: string;
  dueDate: string; // ISO 8601 format
  status: DeadlineStatus;
  description?: string;
};

export type Hearing = {
  id: string;
  caseId: string;
  title: string;
  date: string; // ISO 8601 format
  location: string;
  outcome?: string;

  caseName?: string;
  time?: string;
  hearingType?: string;
  status?: string;};

export type Note = {
  id: string;
  caseId: string;
  content: string;
  author: string; // Could be a UserID in a real app
  dateCreated: string;

  title?: string;
  snippet?: string;
  caseName?: string;
  createdAt?: string;};

export type Report = {
    id: string;
    name: string;
    type: ReportType;
    dateGenerated: string;
    data: Record<string, unknown>; // Flexible data structure for different reports

  generatedAt?: string;
  format?: string;};

// Auto-patched missing exports
export type HearingStatus = "Active" | "Inactive" | "Pending" | "Completed" | "Scheduled" | "Cancelled" | "Postponed" | "Draft" | "Open" | "Closed" | "Approved" | "Rejected" | "Paid" | "Overdue" | "General" | "Other";
