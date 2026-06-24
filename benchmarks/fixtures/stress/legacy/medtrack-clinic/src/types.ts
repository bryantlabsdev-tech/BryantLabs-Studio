// Status union types for various entities
export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'No-Show';
export type PrescriptionStatus = 'Active' | 'Expired' | 'Filled';
export type BillingStatus = 'Pending' | 'Paid' | 'Overdue';

// Domain entity types for the MedTrack Clinic application

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 8601 string format: "YYYY-MM-DD"
  gender: 'Male' | 'Female' | 'Other';
  contact: {
    phone: string;
    email: string;
  };
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  insuranceProvider: string;
  insurancePolicyNumber: string;
}

export interface Provider {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  contact: {
    phone: string;
    email: string;
  };
}

export interface Appointment {
  id: string;
  patientId: Patient['id'];
  providerId: Provider['id'];
  startDateTime: string; // ISO 8601 string
  endDateTime: string; // ISO 8601 string
  reasonForVisit: string;
  status: AppointmentStatus;
}

export interface Prescription {
  id: string;
  patientId: Patient['id'];
  providerId: Provider['id'];
  medication: string;
  dosage: string;
  frequency: string;
  issueDate: string; // ISO 8601 string
  refills: number;
  status: PrescriptionStatus;
}

export interface Billing {
  id: string;
  patientId: Patient['id'];
  appointmentId: Appointment['id'];
  amount: number;
  currency: 'USD';
  issueDate: string; // ISO 8601 string
  dueDate: string; // ISO 8601 string
  status: BillingStatus;
  items: {
    description: string;
    cost: number;
  }[];
}

export interface VisitNote {
  id: string;
  appointmentId: Appointment['id'];
  patientId: Patient['id'];
  providerId: Provider['id'];
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
  subjective: string; // Patient's report
  objective: string; // Provider's observations
  assessment: string; // Diagnosis
  plan: string; // Treatment plan
}

export interface Report {
  id: string;
  name: string;
  type: 'Financial' | 'PatientDemographics' | 'AppointmentVolume';
  generatedDate: string; // ISO 8601 string
  // In a real application, this would be a specific, well-defined type
  data: Record<string, unknown>;
}