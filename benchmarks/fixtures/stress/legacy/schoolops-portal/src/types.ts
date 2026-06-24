// SchoolOps Portal Domain Types

// --- Status & Union Types ---

export type AttendanceStatus = "Present" | "Absent" | "Tardy" | "Excused";
export type GradeLetter = "A" | "B" | "C" | "D" | "F";
export type BehaviorLevel = "Positive" | "Neutral" | "Needs Improvement" | "Concerning";
export type ContactMethod = "Email" | "Phone" | "In-Person";
export type ReportType = "Academic Progress" | "Attendance Summary" | "Behavior Log";

// --- Entity Types ---

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 8601 format
  enrollmentDate: string; // ISO 8601 format
  gradeLevel: number;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  enrollmentStatus?: "Active" | "Withdrawn" | "Graduated";
}

export interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  hireDate: string; // ISO 8601 format
  subject: string; // e.g., "Mathematics", "History"
}

export interface Class {
  id: string;
  name: string; // e.g., "Grade 10 Algebra"
  subject: string;
  teacherId: string;
  studentIds: string[];
  schedule: string; // e.g., "Mon/Wed/Fri 10:00-11:30"
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
  assignment: string; // e.g., "Midterm Exam"
  score: number; // e.g., 88
  letterGrade: GradeLetter;
  date: string; // ISO 8601 format
}

export interface BehaviorLog {
  id: string;
  studentId: string;
  incidentDate: string; // ISO 8601 format
  level: BehaviorLevel;
  description: string;
  actionTaken?: string;
  reportedByTeacherId: string;
}

export interface ParentContact {
  id: string;
  studentId: string;
  contactDate: string; // ISO 8601 format
  method: ContactMethod;
  reason: string;
  notes: string;
  participants: string[]; // e.g., ["Teacher Name", "Parent Name"]
}

export interface Report {
  id: string;
  type: ReportType;
  generatedDate: string; // ISO 8601 format
  data: unknown; // Flexible data structure based on report type
  generatedForId: string; // Could be a student, class, or teacher ID
}

export interface Settings {
  schoolYear: string;
  notifications: {
    email: boolean;
    sms: boolean;
  };
  gradingScale: Record<GradeLetter, number>; // e.g., { "A": 90, "B": 80, ... }
}