// =================================================================
// Domain Types for Build: FleetOps Pro
// =================================================================

// Status Union Types
export type VehicleStatus = 'Active' | 'Inactive' | 'In Shop';
export type DriverStatus = 'Active' | 'On Leave' | 'Terminated';
export type DispatchStatus = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';
export type MaintenanceStatus = 'Scheduled' | 'In Progress' | 'Completed';
export type InspectionStatus = 'Passed' | 'Failed' | "Pending";

// Domain Entities
export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string;
  type: 'Truck' | 'Van' | 'Trailer' | 'Car';
  status: VehicleStatus;
  currentDriverId?: string;
  fuelCapacity: number; // in gallons
  lastInspectionDate?: string;
  odometer: number;
}

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  contactPhone: string;
  email: string;
  status: DriverStatus;
  assignedVehicleId?: string;
  hireDate: string;
}

export interface DispatchJob {
  id: string;
  description: string;
  origin: string;
  destination: string;
  scheduledStartTime: string;
  actualStartTime?: string;
  scheduledEndTime: string;
  actualEndTime?: string;
  status: DispatchStatus;
  vehicleId: string;
  driverId: string;
  notes?: string;
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  description: string;
  serviceType: 'Routine' | 'Repair' | 'Inspection';
  date: string;
  cost: number;
  status: MaintenanceStatus;
  notes?: string;
  odometer: number;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string;
  gallons: number;
  costPerGallon: number;
  totalCost: number;
  odometer: number;
  location?: string;
}

export interface Inspection {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string;
  odometer: number;
  status: InspectionStatus;
  notes?: string;
  items: InspectionItem[];
}

export interface InspectionItem {
  name: string;
  status: 'Pass' | 'Fail' | 'N/A';
  notes?: string;
}

// Reports are typically derived data and might not have a static type.
// For example, a report could be an aggregation of fuel logs or maintenance costs.

export interface AppSettings {
  notifications: {
    email: boolean;
    sms: boolean;
  };
  units: {
    distance: 'miles' | 'kilometers';
    fuel: 'gallons' | 'liters';
  };
  theme: 'dark' | 'light';
}