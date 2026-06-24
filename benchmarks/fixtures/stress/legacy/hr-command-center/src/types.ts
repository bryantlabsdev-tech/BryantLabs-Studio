// --- Status Unions ---

export type EmployeeStatus = 'Active' | 'On Leave' | 'Terminated';
export type OnboardingStatus = 'Not Started' | 'In Progress' | 'Completed';
export type TimeOffStatus = 'Pending' | 'Approved' | 'Rejected';
export type PerformanceReviewStatus = 'Scheduled' | 'Completed';
export type PayrollStatus = 'Draft' | 'Processed' | 'Paid';

// --- Domain Entities ---

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  hireDate: string; // ISO 8601 date string
  status: EmployeeStatus;
  departmentId: string;
}

export interface Department {
  id: string;
  name: string;
  managerId: string; // Employee ID
}

export interface OnboardingTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface OnboardingPlan {
  id: string;
  employeeId: string;
  startDate: string; // ISO 8601 date string
  status: OnboardingStatus;
  tasks: OnboardingTask[];
}

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  type: 'Vacation' | 'Sick' | 'Personal';
  startDate: string; // ISO 8601 date string
  endDate: string; // ISO 8601 date string
  reason: string;
  status: TimeOffStatus;
}

export interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewerId: string; // Employee ID
  reviewDate: string; // ISO 8601 date string
  rating: 1 | 2 | 3 | 4 | 5;
  comments: string;
  goals: string[];
  status: PerformanceReviewStatus;
}

export interface PayrollSummary {
  id: string;
  payPeriodStart: string; // ISO 8601 date string
  payPeriodEnd: string; // ISO 8601 date string
  totalGrossPay: number;
  totalNetPay: number;
  totalTaxes: number;
  status: PayrollStatus;
}

export interface Document {
  id: string;
  name: string;
  type: 'Contract' | 'Policy' | 'Handbook' | 'Review';
  uploadDate: string; // ISO 8601 date string
  url: string;
  employeeId?: string; // Optional: for employee-specific documents
  fileSize?: string;
}

export interface Report {
  id: string;
  name: string;
  type: 'Headcount' | 'Turnover' | 'Payroll' | 'Time Off';
  generatedDate: string; // ISO 8601 date string
  parameters: Record<string, unknown>;
  dataUrl: string;
  title?: string;
  description?: string;
  lastGenerated?: string;
}

// Auto-patched missing exports
export interface PayrollRun {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  payDate?: string;
  totalGrossPay?: number;
}

export type PayrollRunStatus = "Active" | "Inactive" | "Pending" | "Completed" | "Scheduled" | "Cancelled" | "Postponed" | "Draft" | "Open" | "Closed" | "Approved" | "Rejected" | "Paid" | "Overdue" | "General" | "Other" | "Processed" | "Failed";
