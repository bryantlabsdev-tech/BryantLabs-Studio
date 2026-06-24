// src/types.ts

// --- Status Union Types ---

export type VehicleStatus = "Active" | "Inactive" | "In Shop";
export type DriverStatus = "Active" | "On Leave" | "Terminated";
export type DispatchStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled";
export type MaintenanceStatus = "Scheduled" | "In Progress" | "Completed";
export type InspectionStatus = "Pass" | "Fail" | "Needs Attention";
export type ReportType = "Fuel" | "Maintenance" | "Driver Performance" | "Inspections";

// --- Domain Entity Types ---

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string;
  status: VehicleStatus;
  lastInspectionDate?: string;
  nextServiceDate?: string;
}

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  phone: string;
  email: string;
  status: DriverStatus;
  hireDate: string;
}

export interface Dispatch {
  id: string;
  driverId: string;
  vehicleId: string;
  startLocation: string;
  endLocation: string;
  startTime: string; // ISO 8601 date string
  endTime: string;   // ISO 8601 date string
  status: DispatchStatus;
  notes?: string;
}

export interface Maintenance {
  id: string;
  vehicleId: string;
  description: string;
  date: string; // ISO 8601 date string
  cost: number;
  status: MaintenanceStatus;
  serviceProvider?: string;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string; // ISO 8601 date string
  gallons: number;
  costPerGallon: number;
  totalCost: number;
  odometer: number;
}

export interface Inspection {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string; // ISO 8601 date string
  odometer: number;
  notes: string;
  status: InspectionStatus;
  items: { [key: string]: 'Pass' | 'Fail' }; // e.g., { "brakes": "Pass", "tires": "Fail" }
}

export interface Report {
  id: string;
  name: string;
  type: ReportType;
  generatedAt: string; // ISO 8601 date string
  parameters: Record<string, any>;
  data: any[]; // The actual report data
}

export interface AppSettings {
  units: "Imperial" | "Metric";
  notificationPreferences: {
    email: boolean;
    sms: boolean;
  };
  defaultCurrency: "USD" | "EUR" | "GBP";
}