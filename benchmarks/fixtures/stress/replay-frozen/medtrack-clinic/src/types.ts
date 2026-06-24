// Domain-specific types for MedTrack Clinic

// --- Entity Statuses ---

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'No Show';
export type BillingStatus = 'Pending' | 'Paid' | 'Overdue' | 'Sent to Collections';
export type PrescriptionStatus = 'Active' | 'Inactive' | 'Discontinued';

// --- Core Entities ---

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 8601 format
  gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  contactInfo: {
    phone: string;
    email: string;
    address: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  createdAt: string; // ISO 8601 format
  updatedAt: string; // ISO 8601 format
}

export interface Provider {
  id: string;
  firstName: string;
  lastName:string;
  specialty: string;
  contactInfo: {
    phone: string;
    email: string;
  };
  npiNumber: string; // National Provider Identifier
  createdAt: string; // ISO 8601 format
}

export interface Appointment {
  id: string;
  patientId: string;
  providerId: string;
  appointmentDate: string; // ISO 8601 format
  reasonForVisit: string;
  status: AppointmentStatus;
  createdAt: string; // ISO 8601 format
}

export interface Prescription {
  id: string;
  patientId: string;
  providerId: string;
  medication: string;
  dosage: string;
  frequency: string;
  startDate: string; // ISO 8601 format
  endDate?: string; // ISO 8601 format
  status: PrescriptionStatus;
  createdAt: string; // ISO 8601 format
}

export interface BillingItem {
  id: string;
  description: string;
  cptCode: string; // Current Procedural Terminology
  amount: number;
}

export interface Bill {
  id: string;
  patientId: string;
  appointmentId: string;
  billDate: string; // ISO 8601 format
  dueDate: string; // ISO 8601 format
  totalAmount: number;
  status: BillingStatus;
  items: BillingItem[];
  createdAt: string; // ISO 8601 format
}

export interface VisitNote {
  id: string;
  appointmentId: string;
  patientId: string;
  providerId: string;
  visitDate: string; // ISO 8601 format
  chiefComplaint: string;
  subjectiveNotes?: string;
  objectiveNotes?: string;
  assessment: string;
  plan: string;
  createdAt: string; // ISO 8601 format
  patientName?: string;
  providerName?: string;
  summary?: string;
}

export interface Report {
  id: string;
  name: string;
  type: 'Patient Demographics' | 'Billing Summary' | 'Appointment Volume' | 'Prescription Trends';
  generatedDate: string; // ISO 8601 format
  parameters: Record<string, any>;
  data: any[]; // The actual report data
}