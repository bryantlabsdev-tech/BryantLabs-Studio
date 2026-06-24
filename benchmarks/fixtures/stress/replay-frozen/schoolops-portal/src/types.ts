// Domain types for SchoolOps Portal

// --- Status & Union Types ---

export type StudentStatus = 'active' | 'inactive' | 'graduated';
export type TeacherStatus = 'active' | 'on_leave' | 'inactive';
export type AttendanceStatus = 'present' | 'absent' | 'tardy' | 'excused';
export type ContactType = 'email' | 'phone' | 'meeting' | "General";
export type IncidentLevel = 'low' | 'medium' | 'high';
export type ReportType = 'attendance' | 'grades' | 'behavior' | 'enrollment';

// --- Entity Interfaces ---

export interface Student {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 8601 format
  classId: string;
  status: StudentStatus;
  createdAt: string;
  updatedAt: string;
  enrollmentStatus?: "Active" | "Withdrawn" | "Graduated";
  name?: string;
  grade?: number;
  avatarUrl?: string;
}

export interface Teacher {
  id: string;
  teacherId: string;
  firstName: string;
  lastName: string;
  email: string;
  subject: string; // e.g., 'Math', 'Science', 'History'
  status: TeacherStatus;
  createdAt: string;
  updatedAt: string;
  name?: string;
  avatarUrl?: string;
}

export interface Class {
  id: string;
  className: string; // e.g., 'Grade 5 Math - Section A'
  teacherId: string;
  gradeLevel: number;
  roomNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  date: string; // ISO 8601 format
  status: AttendanceStatus;
  notes?: string;
}

export interface Grade {
  id: string;
  studentId: string;
  classId: string;
  assignmentName: string;
  score: number; // e.g., 85
  maxScore: number; // e.g., 100
  date: string; // ISO 8601 format
}

export interface BehaviorLog {
  id: string;
  studentId: string;
  reportedByTeacherId: string;
  date: string; // ISO 8601 format
  incidentDescription: string;
  actionTaken: string;
  level: IncidentLevel;
  studentName?: string;
  incidentType?: string;
  description?: string;
  reportedBy?: string;
}

export interface ParentContact {
  id:string;
  studentId: string;
  contactedByTeacherId: string;
  parentName: string;
  contactType: ContactType;
  date: string; // ISO 8601 format
  notes: string;
  studentName?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface Report {
  id: string;
  name: string;
  type: ReportType;
  generatedAt: string;
  downloadUrl: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  notifications: {
    email: boolean;
    sms: boolean;
  };
  defaultDashboardView: 'kpi' | 'charts';
}

// Auto-patched missing exports
export type BehaviorIncidentType = "Active" | "Inactive" | "Pending" | "Completed" | "Scheduled" | "Cancelled" | "Postponed" | "Draft" | "Open" | "Closed" | "Approved" | "Rejected" | "Paid" | "Overdue" | "General" | "Other" | "Neutral" | "Negative" | "Positive";

export interface ReportInfo {
  id: string;
  name: string;
  title?: string;
  description?: string;
  icon?: unknown;
}
